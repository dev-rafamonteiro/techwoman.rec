import type { ClientSession, ObjectId } from 'mongodb';
import type { MentorSlotReleasedReason, OutboxChannel, OutboxType } from '@tw/shared';
import type { MenteeDoc, OutboxDoc, UserDoc } from '@tw/db';
import { ObjectId as Oid } from 'mongodb';
import type { AppContext } from '../ctx.js';
import { DEFAULT_REMINDERS } from '@tw/shared';
import { reminderSchedule } from '../domain/reminder.js';
import { sealSecret } from './secret-box.js';

/**
 * Canais por tipo (PLAN, "Notificações"): só e-mail, para todos os tipos. O WhatsApp foi removido em 2026-11-05;
 * `whatsapp` só existe em linhas antigas da outbox.
 */
export function channelsFor(): OutboxChannel[] {
  return ['email'];
}

export interface EnqueueInput {
  type: OutboxType;
  mentee: Pick<MenteeDoc, '_id' | 'email'>;
  appointmentId?: ObjectId | null;
  /** Sufixo da dedupeKey quando o mesmo tipo pode repetir (ex.: n do reenvio do link). */
  dedupeSuffix?: string | number;
  sendAt?: Date;
  payload?: Record<string, unknown>;
}

function dedupeBase(i: Omit<EnqueueInput, 'mentee'>, recipientId: ObjectId): string {
  if (i.type === 'registered') return `registered:${recipientId}:${i.dedupeSuffix ?? 0}`;
  // `registration_cancelled:<menteeId>:<version da participante depois do cancelamento>` (mesmo vindo de uma mentoria)
  if (i.type === 'registration_cancelled') return `registration_cancelled:${recipientId}:${i.dedupeSuffix}`;
  // RN21: um e-mail por atendimento fora da mesa (`walk_in_done:<walkInId>`) e por remoção dele (`walk_in_removed:<walkInId>`)
  if (i.type === 'walk_in_done' || i.type === 'walk_in_removed') return `${i.type}:${i.dedupeSuffix}`;
  // RN25: um e-mail por administradora em cada pedido (`mentor_cancel_request:<appointmentId>:<pedido>:<userId>`)
  if (i.type === 'mentor_cancel_request') return `${i.type}:${i.appointmentId}:${i.dedupeSuffix}:${recipientId}`;
  // RN26: um e-mail por administradora em cada alteração (`mentor_availability_changed:<alteração>:<userId>`)
  if (i.type === 'mentor_availability_changed') return `${i.type}:${i.dedupeSuffix}:${recipientId}`;
  // RN27: uma mentoria só é cancelada uma vez (`mentor_cancelled:<appointmentId>:<userId>`)
  if (i.type === 'mentor_cancelled') return `${i.type}:${i.appointmentId}:${recipientId}`;
  return `${i.type}:${i.appointmentId ?? recipientId}${i.dedupeSuffix !== undefined ? `:${i.dedupeSuffix}` : ''}`;
}

/** Destinatária do aviso: participante (`menteeId`) ou mentora (`userId`); o outro id fica null. */
interface Recipient {
  menteeId: ObjectId | null;
  userId: ObjectId | null;
  email: string;
}

/** Um item por canal (só e-mail), gravados na mesma transação da mudança de status (padrão outbox). */
async function insertNotifications(ctx: AppContext, session: ClientSession | undefined, i: Omit<EnqueueInput, 'mentee'>, r: Recipient): Promise<void> {
  const now = ctx.now();
  // a dedupeKey mantém o sufixo `:<canal>` dos itens antigos, para a deduplicação valer contra eles também
  const docs: OutboxDoc[] = channelsFor().map((channel) => ({
    _id: new Oid(),
    eventId: ctx.config.eventId,
    type: i.type,
    channel,
    to: r.email,
    menteeId: r.menteeId,
    userId: r.userId,
    appointmentId: i.appointmentId ?? null,
    payload: { ...i.payload },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: i.sendAt ?? now,
    lockedAt: null,
    lockedBy: null,
    sentAt: null,
    lastError: null,
    dedupeKey: `${dedupeBase(i, (r.menteeId ?? r.userId)!)}:${channel}`,
    createdAt: now,
  }));
  if (docs.length) await ctx.c.outbox.insertMany(docs, session ? { session } : {});
}

/** Grava as mensagens à participante na outbox, na mesma transação da mudança de status (padrão outbox). */
export async function enqueueMenteeNotifications(ctx: AppContext, session: ClientSession | undefined, i: EnqueueInput): Promise<void> {
  const { mentee, ...rest } = i;
  await insertNotifications(ctx, session, rest, { menteeId: mentee._id, userId: null, email: mentee.email });
}

/**
 * Aviso à mentora de que a participante liberou o horário (`mentor_slot_released`, PLAN, Notificações > Aviso à
 * mentora): por e-mail. `menteeId` fica null para o worker não pôr links com o token da participante na mensagem. dedupeKey `mentor_slot_released:<appointmentId>:<canal>`.
 */
export async function enqueueMentorNotifications(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { mentor: Pick<UserDoc, '_id' | 'email'>; appointmentId: ObjectId; reason: MentorSlotReleasedReason },
): Promise<void> {
  await insertNotifications(
    ctx, session,
    { type: 'mentor_slot_released', appointmentId: i.appointmentId, payload: { reason: i.reason } },
    { menteeId: null, userId: i.mentor._id, email: i.mentor.email },
  );
}

/** RN24, RN19 · Aviso à mentora de que uma participante agendou com ela (`mentor_booked`). `menteeId` null, como no aviso acima. */
export async function enqueueMentorBooked(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { mentor: Pick<UserDoc, '_id' | 'email'>; appointmentId: ObjectId },
): Promise<void> {
  await insertNotifications(ctx, session, { type: 'mentor_booked', appointmentId: i.appointmentId }, { menteeId: null, userId: i.mentor._id, email: i.mentor.email });
}

/**
 * RN25 · Pedido de cancelamento da mentora (`mentor_cancel_request`, layout 13) a cada administradora ativa.
 * `payload.justification` é o motivo escrito pela mentora; `requestId` separa pedidos repetidos da mesma mentoria.
 */
export async function enqueueMentorCancelRequest(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { admins: Pick<UserDoc, '_id' | 'email'>[]; appointmentId: ObjectId; requestId: ObjectId; justification: string },
): Promise<void> {
  for (const admin of i.admins) {
    await insertNotifications(
      ctx, session,
      { type: 'mentor_cancel_request', appointmentId: i.appointmentId, dedupeSuffix: String(i.requestId), payload: { justification: i.justification } },
      { menteeId: null, userId: admin._id, email: admin.email },
    );
  }
}

/**
 * RN26 · Alteração de disponibilidade feita pela própria mentora (`mentor_availability_changed`, layout 14) a cada
 * administradora ativa. `payload`: nome da mentora, início dos horários incluídos e tirados (ISO) e quando salvou.
 */
export async function enqueueMentorAvailabilityChanged(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { admins: Pick<UserDoc, '_id' | 'email'>[]; changeId: ObjectId; mentorName: string; added: Date[]; removed: Date[]; at: Date },
): Promise<void> {
  const payload = { mentorName: i.mentorName, added: i.added.map((d) => d.toISOString()), removed: i.removed.map((d) => d.toISOString()), at: i.at.toISOString() };
  for (const admin of i.admins) {
    await insertNotifications(ctx, session, { type: 'mentor_availability_changed', dedupeSuffix: String(i.changeId), payload }, { menteeId: null, userId: admin._id, email: admin.email });
  }
}

/**
 * RN27 · A mentora cancelou a mentoria ou o convite pela agenda (`mentor_cancelled`, layout 15), a cada
 * administradora ativa. `payload`: se era convite, o motivo escrito por ela (ou null) e quando cancelou.
 */
export async function enqueueMentorCancelled(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { admins: Pick<UserDoc, '_id' | 'email'>[]; appointmentId: ObjectId; wasInvite: boolean; justification: string | null; at: Date },
): Promise<void> {
  const payload = { wasInvite: i.wasInvite, justification: i.justification, at: i.at.toISOString() };
  for (const admin of i.admins) {
    await insertNotifications(ctx, session, { type: 'mentor_cancelled', appointmentId: i.appointmentId, payload }, { menteeId: null, userId: admin._id, email: admin.email });
  }
}

/**
 * RN21 · e-mails do atendimento fora da mesa à participante, na transação do registro (E51) ou da remoção (E53):
 * `walk_in_done` (layout 10, mentora e link pessoal) ou `walk_in_removed` (layout 11, nova inscrição). `payload.walkInId`
 * leva o worker ao atendimento (mentora e se ele ainda vale). dedupeKey `<tipo>:<walkInId>:email`.
 */
export async function enqueueWalkInNotification(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { type: 'walk_in_done' | 'walk_in_removed'; mentee: Pick<MenteeDoc, '_id' | 'email'>; walkInId: ObjectId },
): Promise<void> {
  await enqueueMenteeNotifications(ctx, session, { type: i.type, mentee: i.mentee, dedupeSuffix: String(i.walkInId), payload: { walkInId: String(i.walkInId) } });
}

/** dedupeKey de `staff_password`: `pwd:<userId>:<n>` (também é o AAD da cifra). */
export const staffPasswordKey = (userId: ObjectId, n: number) => `pwd:${userId}:${n}`;

/** Senha provisória enviada por e-mail (dedupeKey `pwd:<userId>:<n>`). Vai cifrada em `secret` (AES-256-GCM) e o worker a apaga. */
export async function enqueueStaffPassword(
  ctx: AppContext,
  session: ClientSession | undefined,
  user: Pick<UserDoc, '_id' | 'email' | 'name'>,
  n: number,
  provisionalPassword: string,
): Promise<void> {
  const now = ctx.now();
  const dedupeKey = staffPasswordKey(user._id, n);
  await ctx.c.outbox.insertOne(
    {
      _id: new Oid(),
      eventId: ctx.config.eventId,
      type: 'staff_password',
      channel: 'email',
      to: user.email,
      menteeId: null,
      userId: user._id,
      appointmentId: null,
      payload: {},
      secret: sealSecret(ctx.config.outboxKey, provisionalPassword, dedupeKey),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      lockedAt: null,
      lockedBy: null,
      sentAt: null,
      lastError: null,
      dedupeKey,
      createdAt: now,
    },
    session ? { session } : {},
  );
}

/** Lembretes da mentoria (por e-mail) conforme as regras do evento (A7, até 10); sem regras configuradas, o padrão de RN15. */
export async function enqueueReminders(
  ctx: AppContext,
  session: ClientSession | undefined,
  mentee: Pick<MenteeDoc, '_id' | 'email'>,
  appointment: { _id: ObjectId; startAt: Date },
): Promise<void> {
  const ev = await ctx.c.events.findOne({ _id: ctx.config.eventId }, { session, projection: { reminders: 1 } });
  const rules = ev?.reminders?.length ? ev.reminders : DEFAULT_REMINDERS;
  for (const r of reminderSchedule(appointment.startAt, ctx.now(), rules)) {
    await enqueueMenteeNotifications(ctx, session, {
      type: 'reminder', mentee, appointmentId: appointment._id, sendAt: r.sendAt,
      dedupeSuffix: r.minutesBefore, payload: { minutesBefore: r.minutesBefore },
    });
  }
}
