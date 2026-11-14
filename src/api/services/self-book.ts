import { ObjectId, type ClientSession } from 'mongodb';
import type { E07Response, E58Response } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, TableDoc, UserDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications, enqueueMentorBooked, enqueueReminders } from '../lib/outbox.js';
import { iso } from '../lib/views.js';
import { canSelfBook, checkInvite, chooseMentorForSelfBook, chooseTableForBooking, isActiveAppointment, selfBookSlots } from '../domain/index.js';
import { tableLabel } from '../notifications/ics.js';
import { insertAppointment, newAppointmentDoc } from './appointments.js';

const notAllowed = () => new AppError('INVALID_STATE', 'Escolher o horário sozinha só é possível depois de trocar de horário.');
const slotTaken = () => new AppError('SLOT_UNAVAILABLE', 'Esse horário acabou de ser ocupado. Escolha outro.');

/**
 * Agenda do evento vista pela participante (RN19): mentoras ativas da área dela (`area` null = de todas as trilhas),
 * mentorias ativas (`slotLock`) e mesas ativas. Uma consulta de cada; E07 e E08 decidem em cima disso.
 */
async function loadSelfBookContext(ctx: AppContext, event: EventDoc, area: string | null, session?: ClientSession) {
  const opt = session ? { session } : {};
  const [mentors, active, tables] = await Promise.all([
    ctx.c.users.find({ roles: 'mentor', status: 'active', ...(area ? { areas: area } : {}) }, { ...opt, projection: { name: 1, availability: 1, email: 1, areas: 1 } }).toArray(),
    ctx.c.appointments.find({ eventId: event._id, slotLock: true }, { ...opt, projection: { slotId: 1, mentorId: 1, tableId: 1, startAt: 1, status: 1 } }).toArray(),
    ctx.c.tables.find({ eventId: event._id, active: true }, opt).sort({ number: 1 }).toArray(),
  ]);
  return { mentors, active, tables };
}

/** E07 · horários livres para a participante escolher (RN19); `matchesPeriod` pela RN14. */
export async function listSelfBookSlots(ctx: AppContext, mentee: MenteeDoc): Promise<E07Response> {
  if (!canSelfBook(mentee)) throw notAllowed();
  const event = await loadEvent(ctx);
  const { mentors, active, tables } = await loadSelfBookContext(ctx, event, mentee.area);
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
 * Mesma agenda, sem participante: o que E58 mostra para quem ainda está se inscrevendo (RN24). Horário sem mentora da
 * trilha livre entra com as de outras trilhas (`otherTracks`), como E59 e a gravação (E02) fazem.
 */
export async function listPublicSlots(ctx: AppContext, area: string): Promise<E58Response> {
  const event = await loadEvent(ctx);
  const { mentors, active, tables } = await loadSelfBookContext(ctx, event, null);
  const slotsFor = (list: typeof mentors) => selfBookSlots({
    now: ctx.now(),
    minLeadMinutes: event.minLeadMinutes,
    timezone: event.timezone,
    preferredPeriod: 'any',
    slots: event.slots,
    mentors: list.map((m) => ({ id: String(m._id), availability: m.availability })),
    activeAppointments: active.map((a) => ({ slotId: a.slotId, mentorId: String(a.mentorId), tableId: String(a.tableId) })),
    activeTableIds: tables.map((t) => String(t._id)),
  });
  const inTrack = new Map(slotsFor(mentors.filter((m) => m.areas.includes(area))).map((s) => [s.slotId, s]));
  const items = slotsFor(mentors).map((s) => {
    const own = inTrack.get(s.slotId);
    return own ? { ...own, otherTracks: false } : { ...s, otherTracks: true };
  });
  return { items: items.map((s) => ({ slotId: s.slotId, startAt: iso(s.startAt), endAt: iso(s.endAt), period: s.period, available: s.available, otherTracks: s.otherTracks })) };
}

const SLOT_MENTOR_PROJECTION = { name: 1, photoUrl: 1, bio: 1, linkedin: 1, areas: 1 } as const;
export type SlotMentorDoc = Pick<UserDoc, '_id' | keyof typeof SLOT_MENTOR_PROJECTION>;

/**
 * E59 · até 5 mentoras da trilha, ao acaso, livres no horário; sem nenhuma da trilha, até 5 de outras trilhas
 * (`otherTracks`). Nenhuma se o horário já passou do prazo ou está sem mesa (RN24).
 */
export async function sampleSlotMentors(ctx: AppContext, area: string, slotId: string): Promise<{ mentors: SlotMentorDoc[]; otherTracks: boolean }> {
  const event = await loadEvent(ctx);
  const slot = event.slots.find((s) => s.id === slotId);
  const none = { mentors: [], otherTracks: false };
  if (!slot || slot.startAt.getTime() < ctx.now().getTime() + event.minLeadMinutes * 60_000) return none;
  const [here, tables] = await Promise.all([
    ctx.c.appointments.find({ eventId: event._id, slotId, slotLock: true }, { projection: { mentorId: 1, tableId: 1 } }).toArray(),
    ctx.c.tables.find({ eventId: event._id, active: true }, { projection: { _id: 1 } }).toArray(),
  ]);
  const busyTables = new Set(here.map((a) => String(a.tableId)));
  if (!tables.some((t) => !busyTables.has(String(t._id)))) return none;
  const sample = (byArea: object) => ctx.c.users
    .aggregate<SlotMentorDoc>([
      { $match: { roles: 'mentor', status: 'active', ...byArea, availability: slotId, _id: { $nin: here.map((a) => a.mentorId) } } },
      { $sample: { size: 5 } },
      { $project: SLOT_MENTOR_PROJECTION },
    ])
    .toArray();
  const own = await sample({ areas: area });
  if (own.length) return { mentors: own, otherTracks: false };
  return { mentors: await sample({}), otherTracks: true };
}

type Candidate = { id: string; name: string; activeCount: number };
type Allocation = { event: EventDoc; slot: EventDoc['slots'][number]; mentorId: ObjectId; mentorName: string; mentorEmail: string; table: TableDoc };

/**
 * Reconfere na transação o horário, a mentora (`pick`, entre as livres) e a mesa (RN24). Com `otherTracks`, horário sem
 * mentora da trilha livre aceita as livres de outras trilhas (P4, como E58/E59).
 */
async function allocate(
  ctx: AppContext,
  session: ClientSession,
  input: { event: EventDoc; area: string; slotId: string; pick: (candidates: Candidate[]) => Candidate | null; otherTracks?: boolean },
): Promise<Allocation> {
  const { event } = input;
  const slot = event.slots.find((s) => s.id === input.slotId) ?? null;
  if (!slot) throw new AppError('SLOT_UNAVAILABLE', 'Horário inexistente.', { details: { reason: 'not_in_event' } });

  const { mentors, active, tables } = await loadSelfBookContext(ctx, event, input.otherTracks ? null : input.area, session);
  const here = active.filter((a) => a.slotId === slot.id);
  const busyMentors = new Set(here.map((a) => String(a.mentorId)));
  const busyTables = new Set(here.map((a) => String(a.tableId)));
  const activeCount = new Map<string, number>();
  // desempate da RN19 só por mentorias ativas (invited/confirmed/in_progress); `slotLock` também cobre done
  for (const a of active.filter((x) => isActiveAppointment(x.status))) activeCount.set(String(a.mentorId), (activeCount.get(String(a.mentorId)) ?? 0) + 1);
  const freeAll = mentors.filter((m) => m.availability.includes(slot.id) && !busyMentors.has(String(m._id)));
  const freeInTrack = freeAll.filter((m) => m.areas.includes(input.area));
  const free = freeInTrack.length ? freeInTrack : input.otherTracks ? freeAll : [];
  const chosen = input.pick(free.map((m) => ({ id: String(m._id), name: m.name, activeCount: activeCount.get(String(m._id)) ?? 0 })));
  const mentor = chosen ? free.find((m) => String(m._id) === chosen.id) : undefined;
  const freeTables = tables.filter((t) => !busyTables.has(String(t._id))).map((t) => ({ id: String(t._id), number: t.number, doc: t }));
  if (!mentor || !freeTables.length) throw slotTaken();
  const table = chooseTableForBooking({
    chosenStartAt: slot.startAt,
    mentorId: String(mentor._id),
    neighbourMs: (event.slotMinutes + event.gapMinutes) * 60_000,
    appointments: active.map((a) => ({ mentorId: String(a.mentorId), tableId: String(a.tableId), startAt: a.startAt })),
    freeTables,
  })!.doc;
  // mesma checagem estática de RN04 (antecedência mínima, disponibilidade, mesa ativa)
  const check = checkInvite({
    now: ctx.now(),
    slot,
    mentor: { status: 'active', availability: mentor.availability },
    table,
    minLeadMinutes: event.minLeadMinutes,
  });
  if (!check.ok) throw new AppError('SLOT_UNAVAILABLE', check.message, { details: { reason: check.reason } });
  return { event, slot, mentorId: mentor._id, mentorName: mentor.name, mentorEmail: mentor.email, table };
}

/** Toca a mentora (como `createInvite`), insere a mentoria já `confirmed` e enfileira confirmação, lembretes, aviso à mentora e auditoria. */
async function persistBooking(ctx: AppContext, session: ClientSession, a: Allocation, mentee: MenteeDoc, ip: string | null | undefined): Promise<AppointmentDoc> {
  const now = ctx.now();
  const actor = { userId: null, role: 'mentee' as const };
  await ctx.c.users.updateOne({ _id: a.mentorId }, { $set: { updatedAt: now } }, { session });
  const appt = newAppointmentDoc({
    eventId: a.event._id,
    menteeId: mentee._id,
    mentorId: a.mentorId,
    tableId: a.table._id,
    slotId: a.slot.id,
    startAt: a.slot.startAt,
    endAt: a.slot.endAt,
    status: 'confirmed',
    expiresAt: null,
    createdBy: { userId: a.mentorId, role: 'mentor' },
    confirmedBy: actor,
    history: { from: null, to: 'confirmed', by: actor, at: now, reason: null },
    now,
  });
  try {
    await insertAppointment(ctx, session, appt);
  } catch (err) {
    if (err instanceof AppError && err.code === 'MENTOR_BUSY') throw slotTaken();
    if (err instanceof AppError && err.code === 'MENTEE_TAKEN') throw new AppError('INVALID_STATE', 'Você já tem uma mentoria. Atualize a página.');
    throw err;
  }
  await ctx.c.mentees.updateOne({ _id: mentee._id }, { $set: { currentAppointmentId: appt._id } }, { session });
  mentee.currentAppointmentId = appt._id;
  await enqueueMenteeNotifications(ctx, session, { type: 'confirmed', mentee, appointmentId: appt._id });
  await enqueueReminders(ctx, session, mentee, appt);
  await enqueueMentorBooked(ctx, session, { mentor: { _id: a.mentorId, email: a.mentorEmail }, appointmentId: appt._id });
  await writeAudit(ctx, session, {
    actor,
    action: 'appointment.self_book',
    entity: 'appointment',
    entityId: appt._id,
    after: { status: 'confirmed', menteeId: String(mentee._id), mentorId: String(a.mentorId), slotId: a.slot.id, tableId: String(a.table._id) },
    ip: ip ?? null,
  });
  return appt;
}

const MAX_BOOKING_ATTEMPTS = 6;

/**
 * Transação de agendamento automático. A mesa não é escolha da pessoa: quem perde a corrida pela mesa (E11000, que aborta
 * a transação e `withTransaction` não repete) tenta de novo e fica com outra. Mentora ocupada não repete: vira SLOT_UNAVAILABLE.
 */
export async function runBookingTxn<T>(ctx: AppContext, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runTxn(ctx, fn);
    } catch (err) {
      if (!(err instanceof AppError && err.code === 'TABLE_TAKEN')) throw err;
      if (attempt >= MAX_BOOKING_ATTEMPTS) throw slotTaken();
    }
  }
}

/**
 * E08 · a participante escolhe o horário (RN19), dentro da transação aberta por `runBookingTxn`. Reconfere tudo, escolhe a
 * mentora com menos mentorias ativas (empate: nome) e a mesa pela RN24; reivindica a participante (`waiting` ->
 * `confirmed`, condicional) e grava a mentoria. Os índices únicos barram a corrida.
 */
export async function selfBook(
  ctx: AppContext,
  session: ClientSession,
  input: { menteeId: ObjectId; slotId: string; ip?: string | null },
): Promise<{ appointment: AppointmentDoc; mentee: MenteeDoc }> {
  const event = await loadEvent(ctx, session);
  const fresh = await ctx.c.mentees.findOne({ _id: input.menteeId, eventId: event._id }, { session });
  if (!fresh) throw new AppError('NOT_FOUND', 'Não encontramos sua inscrição.');
  if (!canSelfBook(fresh)) throw notAllowed();
  const allocation = await allocate(ctx, session, { event, area: fresh.area, slotId: input.slotId, pick: chooseMentorForSelfBook });
  const mentee = await ctx.c.mentees.findOneAndUpdate(
    { _id: fresh._id, status: 'waiting', lastOutcome: 'declined_schedule' },
    { $set: { status: 'confirmed', priority: false, priorityReason: null, lastOutcome: null, updatedAt: ctx.now() }, $inc: { version: 1 } },
    { session, returnDocument: 'after' },
  );
  if (!mentee) throw notAllowed();
  return { appointment: await persistBooking(ctx, session, allocation, mentee, input.ip), mentee };
}

/**
 * RN24 · agenda a mentora escolhida em P4 na mesma transação que grava a inscrição (`mentee` já `confirmed`): se o
 * horário acabou de ser ocupado, a transação aborta e não sobra inscrição sem mentoria.
 */
export async function bookOnRegistration(
  ctx: AppContext,
  session: ClientSession,
  mentee: MenteeDoc,
  input: { slotId: string; mentorId: string; ip?: string | null },
): Promise<{ mentorName: string; tableLabel: string; startAt: string; endAt: string }> {
  const event = await loadEvent(ctx, session);
  const a = await allocate(ctx, session, {
    event,
    area: mentee.area,
    slotId: input.slotId,
    pick: (candidates) => candidates.find((c) => c.id === input.mentorId) ?? null,
    otherTracks: true,
  });
  await persistBooking(ctx, session, a, mentee, input.ip);
  return { mentorName: a.mentorName, tableLabel: tableLabel(a.table), startAt: iso(a.slot.startAt), endAt: iso(a.slot.endAt) };
}
