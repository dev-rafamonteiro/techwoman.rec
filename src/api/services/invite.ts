import { ObjectId, type ClientSession } from 'mongodb';
import type { AppointmentDoc, MenteeDoc, TableDoc } from '@tw/db';
import { loadEvent, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import { checkInvite, computeExpiry, type Actor, type InviteWarning } from '../domain/index.js';
import { insertAppointment, newAppointmentDoc } from './appointments.js';

/**
 * Criação do convite (E24, E39 POST), dentro da transação snapshot/majority aberta por `runTxn`:
 * 1) valida a parte estática de RN04; 2) reivindica a participante (`waiting` -> `invited`, condicional);
 * 3) toca o documento da mentora (serializa com E21 em disponibilidade); 4) insere a mentoria, onde os índices
 * únicos barram mesa e mentora ocupadas (E11000 vira TABLE_TAKEN/MENTOR_BUSY/MENTEE_TAKEN);
 * 5) outbox `invite` e auditoria na mesma transação.
 */
export async function createInvite(
  ctx: AppContext,
  session: ClientSession,
  input: {
    menteeId: ObjectId;
    mentorId: ObjectId;
    slotId: string;
    tableId: ObjectId;
    actor: Actor;
    createdByRole: 'mentor' | 'admin' | 'super_admin';
    override?: { ignoreAvailability?: boolean; ignoreLeadTime?: boolean };
    ip?: string | null;
  },
): Promise<{ appointment: AppointmentDoc; mentee: MenteeDoc; table: TableDoc; warnings: InviteWarning[] }> {
  const now = ctx.now();
  const event = await loadEvent(ctx, session);
  const [mentor, table] = await Promise.all([
    ctx.c.users.findOne({ _id: input.mentorId, roles: 'mentor' }, { session }),
    ctx.c.tables.findOne({ _id: input.tableId, eventId: event._id }, { session }),
  ]);
  if (!mentor) throw notFound('Mentora');
  if (!table) throw notFound('Mesa');
  const slot = event.slots.find((s) => s.id === input.slotId) ?? null;
  const check = checkInvite({
    now,
    slot,
    mentor: { status: mentor.status, availability: mentor.availability },
    table,
    minLeadMinutes: event.minLeadMinutes,
    ...(input.override ? { override: input.override } : {}),
  });
  if (!check.ok) throw new AppError('SLOT_UNAVAILABLE', check.message, { details: { reason: check.reason } });
  if (!slot) throw new AppError('SLOT_UNAVAILABLE', 'Horário inexistente.', { details: { reason: 'not_in_event' } });

  const mentee = await ctx.c.mentees.findOneAndUpdate(
    { _id: input.menteeId, eventId: event._id, status: 'waiting' },
    { $set: { status: 'invited', lastOutcome: null, updatedAt: now }, $inc: { version: 1 } },
    { session, returnDocument: 'after' },
  );
  if (!mentee) {
    const exists = await ctx.c.mentees.countDocuments({ _id: input.menteeId, eventId: event._id }, { session });
    if (!exists) throw notFound('Participante');
    throw new AppError('MENTEE_TAKEN', 'Outra mentora acabou de convidar esta participante.');
  }
  await ctx.c.users.updateOne({ _id: mentor._id }, { $set: { updatedAt: now } }, { session });

  const appt = newAppointmentDoc({
    eventId: event._id,
    menteeId: mentee._id,
    mentorId: mentor._id,
    tableId: table._id,
    slotId: slot.id,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: 'invited',
    expiresAt: computeExpiry(now, slot.startAt, event.responseWindowMinutes),
    createdBy: { userId: new ObjectId(input.actor.userId as string), role: input.createdByRole },
    history: { from: null, to: 'invited', by: { userId: new ObjectId(input.actor.userId as string), role: input.createdByRole }, at: now, reason: null },
    now,
  });
  await insertAppointment(ctx, session, appt);
  await ctx.c.mentees.updateOne({ _id: mentee._id }, { $set: { currentAppointmentId: appt._id } }, { session });
  mentee.currentAppointmentId = appt._id;
  await enqueueMenteeNotifications(ctx, session, { type: 'invite', mentee, appointmentId: appt._id });
  await writeAudit(ctx, session, {
    actor: input.actor,
    action: 'appointment.invite',
    entity: 'appointment',
    entityId: appt._id,
    after: { status: 'invited', menteeId: String(mentee._id), mentorId: String(mentor._id), slotId: slot.id, tableId: String(table._id), warnings: check.warnings },
    ip: input.ip ?? null,
  });
  return { appointment: appt, mentee, table, warnings: check.warnings };
}
