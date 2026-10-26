import type { ClientSession, ObjectId } from 'mongodb';
import type { MentorSlotReleasedReason, OutboxChannel, OutboxType } from '@tw/shared';
import type { MenteeDoc, OutboxDoc, UserDoc } from '@tw/db';
import { ObjectId as Oid } from 'mongodb';
import type { AppContext } from '../ctx.js';
import { DEFAULT_REMINDERS } from '@tw/shared';
import { reminderSchedule } from '../domain/reminder.js';
import { presenceReminderMinutes } from '../domain/presence.js';
import { sealSecret } from './secret-box.js';

/**
 * Canais por tipo (PLAN, "Notificações"): e-mail é o canal obrigatório; WhatsApp só se ligado e houver telefone.
 * Lembrete: canais da regra (e-mail se o WhatsApp não estiver disponível). Senha da mentora: só e-mail. Respostas da
 * presença (RN18) e do convite (RN20): só WhatsApp, e nada sem WhatsApp disponível. Nos demais tipos, `wanted`
 * (quando vem) restringe os canais: interseção com os disponíveis (RN18 "Não vou": `slot_released` só por e-mail); se
 * a interseção ficar vazia, vai por e-mail, o canal obrigatório.
 * A destinatária é a participante ou, no `mentor_slot_released`, a mentora (telefone de `users.phone`, opcional).
 */
export function channelsFor(ctx: AppContext, type: OutboxType, recipient: { phone?: string | null } | null, wanted?: readonly OutboxChannel[]): OutboxChannel[] {
  const wa = ctx.config.whatsappEnabled && !!recipient?.phone;
  if (type === 'staff_password') return ['email'];
  if (isPresenceReply(type)) return wa ? ['whatsapp'] : [];
  if (type === 'reminder') {
    // canais da regra de A7; WhatsApp indisponível cai para e-mail para o lembrete nunca se perder
    const ok = (wanted ?? ['whatsapp']).filter((c) => c === 'email' || wa);
    return ok.length ? [...new Set(ok)] : ['email'];
  }
  const all: OutboxChannel[] = wa ? ['email', 'whatsapp'] : ['email'];
  if (!wanted) return all;
  const ok = all.filter((c) => wanted.includes(c));
  return ok.length ? ok : ['email'];
}

export interface EnqueueInput {
  type: OutboxType;
  mentee: Pick<MenteeDoc, '_id' | 'email' | 'phone'>;
  appointmentId?: ObjectId | null;
  /** Sufixo da dedupeKey quando o mesmo tipo pode repetir (ex.: n do reenvio do link). */
  dedupeSuffix?: string | number;
  sendAt?: Date;
  payload?: Record<string, unknown>;
  /** Lembrete: canais escolhidos na regra de A7. Outros tipos: restringe os canais padrão (`notifyChannels` de applyTransition). */
  channels?: readonly OutboxChannel[];
  /** Campos extras do `payload` só no item daquele canal (RN18: `presenceCheck` só no item `whatsapp`). */
  channelPayload?: Partial<Record<OutboxChannel, Record<string, unknown>>>;
}

/** Respostas fixas pelo WhatsApp à presença (RN18) e ao convite (RN20). */
export type PresenceReplyType =
  | 'presence_confirmed' | 'presence_cancelled' | 'presence_unclear'
  | 'invite_closed' | 'invite_decline_link' | 'invite_unclear';
const PRESENCE_REPLIES: ReadonlySet<OutboxType> = new Set<PresenceReplyType>([
  'presence_confirmed', 'presence_cancelled', 'presence_unclear', 'invite_closed', 'invite_decline_link', 'invite_unclear',
]);
const isPresenceReply = (t: OutboxType): t is PresenceReplyType => PRESENCE_REPLIES.has(t);

function dedupeBase(i: Omit<EnqueueInput, 'mentee'>, recipientId: ObjectId): string {
  if (i.type === 'registered') return `registered:${recipientId}:${i.dedupeSuffix ?? 0}`;
  // `registration_cancelled:<menteeId>:<version da participante depois do cancelamento>` (mesmo vindo de uma mentoria)
  if (i.type === 'registration_cancelled') return `registration_cancelled:${recipientId}:${i.dedupeSuffix}`;
  // uma resposta por mensagem recebida: `presence:<id da mensagem recebida>`
  if (isPresenceReply(i.type)) return `presence:${i.dedupeSuffix}`;
  return `${i.type}:${i.appointmentId ?? recipientId}${i.dedupeSuffix !== undefined ? `:${i.dedupeSuffix}` : ''}`;
}

/** Destinatária do aviso: participante (`menteeId`) ou mentora (`userId`); o outro id fica null. */
interface Recipient {
  menteeId: ObjectId | null;
  userId: ObjectId | null;
  email: string;
  phone?: string | null;
}

/** Um item por canal disponível, gravados na mesma transação da mudança de status (padrão outbox). */
async function insertNotifications(ctx: AppContext, session: ClientSession | undefined, i: Omit<EnqueueInput, 'mentee'>, r: Recipient): Promise<void> {
  const now = ctx.now();
  const docs: OutboxDoc[] = channelsFor(ctx, i.type, r, i.channels).map((channel) => ({
    _id: new Oid(),
    eventId: ctx.config.eventId,
    type: i.type,
    channel,
    to: channel === 'email' ? r.email : (r.phone as string),
    menteeId: r.menteeId,
    userId: r.userId,
    appointmentId: i.appointmentId ?? null,
    payload: { ...i.payload, ...i.channelPayload?.[channel] },
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
  await insertNotifications(ctx, session, rest, { menteeId: mentee._id, userId: null, email: mentee.email, phone: mentee.phone });
}

/**
 * Aviso à mentora de que a participante liberou o horário (`mentor_slot_released`, PLAN, Notificações > Aviso à
 * mentora): e-mail, mais WhatsApp se ligado e se ela tiver `phone`. `menteeId` fica null para o worker não pôr links com
 * o token da participante na mensagem. dedupeKey `mentor_slot_released:<appointmentId>:<canal>`.
 */
export async function enqueueMentorNotifications(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { mentor: Pick<UserDoc, '_id' | 'email' | 'phone'>; appointmentId: ObjectId; reason: MentorSlotReleasedReason },
): Promise<void> {
  await insertNotifications(
    ctx, session,
    { type: 'mentor_slot_released', appointmentId: i.appointmentId, payload: { reason: i.reason } },
    { menteeId: null, userId: i.mentor._id, email: i.mentor.email, phone: i.mentor.phone ?? null },
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

/**
 * Lembretes da mentoria conforme as regras do evento (A7, até 10); sem regras configuradas, o padrão de RN15.
 * RN18: o primeiro que sai pelo WhatsApp leva `payload.presenceCheck: true` só no item `whatsapp` (List Message).
 */
export async function enqueueReminders(
  ctx: AppContext,
  session: ClientSession | undefined,
  mentee: Pick<MenteeDoc, '_id' | 'email' | 'phone'>,
  appointment: { _id: ObjectId; startAt: Date },
): Promise<void> {
  const ev = await ctx.c.events.findOne({ _id: ctx.config.eventId }, { session, projection: { reminders: 1 } });
  const rules = ev?.reminders?.length ? ev.reminders : DEFAULT_REMINDERS;
  const schedule = reminderSchedule(appointment.startAt, ctx.now(), rules);
  const presenceAt = presenceReminderMinutes(schedule, ctx.config.whatsappEnabled && !!mentee.phone);
  for (const r of schedule) {
    await enqueueMenteeNotifications(ctx, session, {
      type: 'reminder', mentee, appointmentId: appointment._id, sendAt: r.sendAt,
      channels: r.channels, dedupeSuffix: r.minutesBefore, payload: { minutesBefore: r.minutesBefore },
      ...(r.minutesBefore === presenceAt ? { channelPayload: { whatsapp: { presenceCheck: true } } } : {}),
    });
  }
}

/** RN18/RN20 · Resposta fixa à presença ou ao convite (só WhatsApp; sem WhatsApp disponível, não sai nada). */
export async function enqueuePresenceReply(
  ctx: AppContext,
  session: ClientSession | undefined,
  i: { type: PresenceReplyType; mentee: Pick<MenteeDoc, '_id' | 'email' | 'phone'>; appointmentId: ObjectId; inboundId: string },
): Promise<void> {
  await enqueueMenteeNotifications(ctx, session, { type: i.type, mentee: i.mentee, appointmentId: i.appointmentId, dedupeSuffix: i.inboundId });
}
