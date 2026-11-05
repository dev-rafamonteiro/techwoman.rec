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
