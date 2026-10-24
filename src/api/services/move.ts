import { ObjectId, type ClientSession } from 'mongodb';
import type { AppointmentDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { loadEvent } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import { checkInvite, reminderSendAt, type Actor, type InviteWarning } from '../domain/index.js';
import { insertAppointment, newAppointmentDoc } from './appointments.js';
import { applyTransition } from './transitions.js';

/**
 * E39 · mover (mesma transação): o registro antigo vira `cancelled` (sem prioridade, motivo `moved`) e um novo nasce
 * `confirmed`, mantendo a confirmação da participante, que recebe aviso com o novo horário/mesa. A ordem importa:
 * primeiro retira as travas do antigo, depois insere o novo (índice de participante).
 */
export async function moveAppointment(
  ctx: AppContext,
  session: ClientSession,
  input: { appointmentId: ObjectId; slotId: string; tableId: ObjectId; ignoreAvailability?: boolean; ignoreLeadTime?: boolean; actor: Actor; ip?: string | null },
): Promise<{ appointment: AppointmentDoc; warnings: InviteWarning[] }> {
  const now = ctx.now();
  const event = await loadEvent(ctx, session);
  const old = await ctx.c.appointments.findOne({ _id: input.appointmentId }, { session });
  if (!old) throw notFound('Mentoria');
  if (old.slotId === input.slotId && old.tableId.equals(input.tableId)) {
    throw new AppError('VALIDATION_ERROR', 'Escolha outra mesa ou outro horário.');
  }
  const [mentor, table] = await Promise.all([ctx.c.users.findOne({ _id: old.mentorId }, { session }), ctx.c.tables.findOne({ _id: input.tableId, eventId: event._id }, { session })]);
  if (!mentor) throw notFound('Mentora');
  const slot = event.slots.find((s) => s.id === input.slotId) ?? null;
  const check = checkInvite({
    now,
    slot,
    mentor: { status: mentor.status, availability: mentor.availability },
    table,
    minLeadMinutes: event.minLeadMinutes,
    override: { ignoreAvailability: input.ignoreAvailability === true, ignoreLeadTime: input.ignoreLeadTime === true },
  });
  if (!check.ok) throw new AppError('SLOT_UNAVAILABLE', check.message, { details: { reason: check.reason } });
  if (!slot) throw new AppError('SLOT_UNAVAILABLE', 'Horário inexistente.', { details: { reason: 'not_in_event' } });

  const cancelled = await applyTransition(ctx, session, { appointmentId: old._id, action: 'move_cancel', actor: input.actor, reason: 'moved', ip: input.ip ?? null });
  if (!cancelled) throw notFound('Mentoria');
  const actorRole = input.actor.role === 'super_admin' ? 'super_admin' : 'admin';
  const fresh = newAppointmentDoc({
    eventId: event._id,
    menteeId: old.menteeId,
    mentorId: old.mentorId,
    tableId: input.tableId,
    slotId: slot.id,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: 'confirmed',
    expiresAt: null,
    createdBy: { userId: old.createdBy.userId, role: old.createdBy.role },
    confirmedBy: old.confirmedBy,
    movedFromId: old._id,
    history: { from: null, to: 'confirmed', by: { userId: input.actor.userId ? new ObjectId(input.actor.userId) : null, role: actorRole }, at: now, reason: 'moved' },
    now,
  });
  await insertAppointment(ctx, session, fresh);
  // a mentora precisa continuar ativa no horário novo: mesma trava de concorrência de E24
  await ctx.c.users.updateOne({ _id: old.mentorId }, { $set: { updatedAt: now } }, { session });
  const mentee = await ctx.c.mentees.findOneAndUpdate({ _id: old.menteeId }, { $set: { currentAppointmentId: fresh._id, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
  if (!mentee) throw notFound('Participante');
  await enqueueMenteeNotifications(ctx, session, { type: 'moved', mentee, appointmentId: fresh._id });
  await enqueueMenteeNotifications(ctx, session, { type: 'reminder', mentee, appointmentId: fresh._id, sendAt: reminderSendAt(fresh.startAt, now) });
  await writeAudit(ctx, session, { actor: input.actor, action: 'appointment.move_to', entity: 'appointment', entityId: fresh._id, before: { appointmentId: String(old._id), slotId: old.slotId, tableId: String(old.tableId) }, after: { slotId: fresh.slotId, tableId: String(fresh.tableId) }, ip: input.ip ?? null });
  return { appointment: fresh, warnings: check.warnings };
}
