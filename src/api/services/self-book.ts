import { ObjectId, type ClientSession } from 'mongodb';
import type { E07Response } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc } from '@tw/db';
import { loadEvent, type AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications, enqueueReminders } from '../lib/outbox.js';
import { iso } from '../lib/views.js';
import { canSelfBook, checkInvite, isActiveAppointment, chooseMentorForSelfBook, selfBookSlots, suggestTable } from '../domain/index.js';
import { insertAppointment, newAppointmentDoc } from './appointments.js';

const notAllowed = () => new AppError('INVALID_STATE', 'Escolher o horário sozinha só é possível depois de trocar de horário.');
const slotTaken = () => new AppError('SLOT_UNAVAILABLE', 'Esse horário acabou de ser ocupado. Escolha outro.');

/**
 * Agenda do evento vista pela participante (RN19): mentoras ativas da área dela, mentorias ativas (`slotLock`) e
 * mesas ativas. Uma consulta de cada; E07 e E08 decidem em cima disso.
 */
async function loadSelfBookContext(ctx: AppContext, event: EventDoc, mentee: Pick<MenteeDoc, 'area'>, session?: ClientSession) {
  const opt = session ? { session } : {};
  const [mentors, active, tables] = await Promise.all([
    ctx.c.users.find({ roles: 'mentor', status: 'active', areas: mentee.area }, { ...opt, projection: { name: 1, availability: 1 } }).toArray(),
    ctx.c.appointments.find({ eventId: event._id, slotLock: true }, { ...opt, projection: { slotId: 1, mentorId: 1, tableId: 1, startAt: 1, status: 1 } }).toArray(),
    ctx.c.tables.find({ eventId: event._id, active: true }, opt).sort({ number: 1 }).toArray(),
  ]);
  return { mentors, active, tables };
}

/** E07 · horários livres para a participante escolher (RN19); `matchesPeriod` pela RN14. */
export async function listSelfBookSlots(ctx: AppContext, mentee: MenteeDoc): Promise<E07Response> {
  if (!canSelfBook(mentee)) throw notAllowed();
  const event = await loadEvent(ctx);
  const { mentors, active, tables } = await loadSelfBookContext(ctx, event, mentee);
  const items = selfBookSlots({
    now: ctx.now(),
    minLeadMinutes: event.minLeadMinutes,
    timezone: event.timezone,
    preferredPeriod: mentee.preferredPeriod,
    slots: event.slots,
    mentors: mentors.map((m) => ({ id: String(m._id), availability: m.availability })),
    activeAppointments: active.map((a) => ({ slotId: a.slotId, mentorId: String(a.mentorId), tableId: String(a.tableId) })),
    activeTableIds: tables.map((t) => String(t._id)),
  });
  return { items: items.map((s) => ({ slotId: s.slotId, startAt: iso(s.startAt), endAt: iso(s.endAt), matchesPeriod: s.matchesPeriod })) };
}

/**
 * E08 · a participante escolhe o horário (RN19), dentro da transação aberta por `runTxn`. Reconfere tudo, escolhe a
 * mentora com menos mentorias ativas (empate: nome) e a mesa pela RN13; reivindica a participante (`waiting` ->
 * `confirmed`, condicional), toca a mentora (como `createInvite`) e insere a mentoria já `confirmed`. Os índices
 * únicos barram a corrida: mesa ou mentora ocupada vira SLOT_UNAVAILABLE.
 */
export async function selfBook(
  ctx: AppContext,
  session: ClientSession,
  input: { menteeId: ObjectId; slotId: string; ip?: string | null },
): Promise<{ appointment: AppointmentDoc; mentee: MenteeDoc }> {
  const now = ctx.now();
  const actor = { userId: null, role: 'mentee' as const };
  const event = await loadEvent(ctx, session);
  const fresh = await ctx.c.mentees.findOne({ _id: input.menteeId, eventId: event._id }, { session });
  if (!fresh) throw new AppError('NOT_FOUND', 'Não encontramos sua inscrição.');
  if (!canSelfBook(fresh)) throw notAllowed();
  const slot = event.slots.find((s) => s.id === input.slotId) ?? null;
  if (!slot) throw new AppError('SLOT_UNAVAILABLE', 'Horário inexistente.', { details: { reason: 'not_in_event' } });

  const { mentors, active, tables } = await loadSelfBookContext(ctx, event, fresh, session);
  const here = active.filter((a) => a.slotId === slot.id);
  const busyMentors = new Set(here.map((a) => String(a.mentorId)));
  const busyTables = new Set(here.map((a) => String(a.tableId)));
  const activeCount = new Map<string, number>();
  // desempate da RN19 só por mentorias ativas (invited/confirmed/in_progress); `slotLock` também cobre done/no_show
  for (const a of active.filter((x) => isActiveAppointment(x.status))) activeCount.set(String(a.mentorId), (activeCount.get(String(a.mentorId)) ?? 0) + 1);
  const mentor = chooseMentorForSelfBook(
    mentors
      .filter((m) => m.availability.includes(slot.id) && !busyMentors.has(String(m._id)))
      .map((m) => ({ id: String(m._id), name: m.name, activeCount: activeCount.get(String(m._id)) ?? 0, doc: m })),
  );
  const freeTables = tables.filter((t) => !busyTables.has(String(t._id)));
  if (!mentor || !freeTables.length) throw slotTaken();
  const { suggestedTableId } = suggestTable({
    chosenStartAt: slot.startAt,
    mentorAppointments: active.filter((a) => String(a.mentorId) === mentor.id).map((a) => ({ tableId: String(a.tableId), startAt: a.startAt })),
    freeTables: freeTables.map((t) => ({ id: String(t._id), number: t.number })),
  });
  const table = freeTables.find((t) => String(t._id) === suggestedTableId) ?? freeTables[0]!;
  // mesma checagem estática de RN04 (antecedência mínima, disponibilidade, mesa ativa)
  const check = checkInvite({
    now,
    slot,
    mentor: { status: 'active', availability: mentor.doc.availability },
    table,
    minLeadMinutes: event.minLeadMinutes,
  });
  if (!check.ok) throw new AppError('SLOT_UNAVAILABLE', check.message, { details: { reason: check.reason } });

  const mentee = await ctx.c.mentees.findOneAndUpdate(
    { _id: fresh._id, status: 'waiting', lastOutcome: 'declined_schedule' },
    { $set: { status: 'confirmed', priority: false, priorityReason: null, lastOutcome: null, updatedAt: now }, $inc: { version: 1 } },
    { session, returnDocument: 'after' },
  );
  if (!mentee) throw notAllowed();
  const mentorId = new ObjectId(mentor.id);
  await ctx.c.users.updateOne({ _id: mentorId }, { $set: { updatedAt: now } }, { session });

  const appt = newAppointmentDoc({
    eventId: event._id,
    menteeId: mentee._id,
    mentorId,
    tableId: table._id,
    slotId: slot.id,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: 'confirmed',
    expiresAt: null,
    createdBy: { userId: mentorId, role: 'mentor' },
    confirmedBy: actor,
    history: { from: null, to: 'confirmed', by: actor, at: now, reason: null },
    now,
  });
  try {
    await insertAppointment(ctx, session, appt);
  } catch (err) {
    if (err instanceof AppError && (err.code === 'TABLE_TAKEN' || err.code === 'MENTOR_BUSY')) throw slotTaken();
    if (err instanceof AppError && err.code === 'MENTEE_TAKEN') throw new AppError('INVALID_STATE', 'Você já tem uma mentoria. Atualize a página.');
    throw err;
  }
  await ctx.c.mentees.updateOne({ _id: mentee._id }, { $set: { currentAppointmentId: appt._id } }, { session });
  mentee.currentAppointmentId = appt._id;
  await enqueueMenteeNotifications(ctx, session, { type: 'confirmed', mentee, appointmentId: appt._id });
  await enqueueReminders(ctx, session, mentee, appt);
  await writeAudit(ctx, session, {
    actor,
    action: 'appointment.self_book',
    entity: 'appointment',
    entityId: appt._id,
    after: { status: 'confirmed', menteeId: String(mentee._id), mentorId: mentor.id, slotId: slot.id, tableId: String(table._id) },
    ip: input.ip ?? null,
  });
  return { appointment: appt, mentee };
}
