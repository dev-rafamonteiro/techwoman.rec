import type { ClientSession, ObjectId } from 'mongodb';
import type { OutboxChannel, OutboxType } from '@tw/shared';
import type { MenteeDoc, OutboxDoc, UserDoc } from '@tw/db';
import { ObjectId as Oid } from 'mongodb';
import type { AppContext } from '../ctx.js';
import { DEFAULT_REMINDERS } from '@tw/shared';
import { reminderSchedule } from '../domain/reminder.js';
import { sealSecret } from './secret-box.js';

/**
 * Canais por tipo (PLAN, "Notificações"): e-mail é o canal obrigatório; WhatsApp só se ligado e houver telefone.
 * Lembrete: WhatsApp (e-mail se não houver). Expirado: só e-mail.
 */
export function channelsFor(ctx: AppContext, type: OutboxType, mentee: Pick<MenteeDoc, 'phone'> | null, wanted?: readonly OutboxChannel[]): OutboxChannel[] {
  const wa = ctx.config.whatsappEnabled && !!mentee?.phone;
  if (type === 'expired' || type === 'staff_password') return ['email'];
  if (type === 'reminder') {
    // canais da regra de A7; WhatsApp indisponível cai para e-mail para o lembrete nunca se perder
    const ok = (wanted ?? ['whatsapp']).filter((c) => c === 'email' || wa);
    return ok.length ? [...new Set(ok)] : ['email'];
  }
  return wa ? ['email', 'whatsapp'] : ['email'];
}

export interface EnqueueInput {
  type: OutboxType;
  mentee: Pick<MenteeDoc, '_id' | 'email' | 'phone'>;
  appointmentId?: ObjectId | null;
  /** Sufixo da dedupeKey quando o mesmo tipo pode repetir (ex.: n do reenvio do link). */
  dedupeSuffix?: string | number;
  sendAt?: Date;
  payload?: Record<string, unknown>;
  /** Lembrete: canais escolhidos na regra de A7. */
  channels?: readonly OutboxChannel[];
}

function dedupeBase(i: EnqueueInput): string {
  if (i.type === 'registered') return `registered:${i.mentee._id}:${i.dedupeSuffix ?? 0}`;
  return `${i.type}:${i.appointmentId ?? i.mentee._id}${i.dedupeSuffix !== undefined ? `:${i.dedupeSuffix}` : ''}`;
}

/** Grava as mensagens na outbox, na mesma transação da mudança de status (padrão outbox). */
export async function enqueueMenteeNotifications(ctx: AppContext, session: ClientSession | undefined, i: EnqueueInput): Promise<void> {
  const now = ctx.now();
  const docs: OutboxDoc[] = channelsFor(ctx, i.type, i.mentee, i.channels).map((channel) => ({
    _id: new Oid(),
    eventId: ctx.config.eventId,
    type: i.type,
    channel,
    to: channel === 'email' ? i.mentee.email : (i.mentee.phone as string),
    menteeId: i.mentee._id,
    userId: null,
    appointmentId: i.appointmentId ?? null,
    payload: i.payload ?? {},
    status: 'pending',
    attempts: 0,
    nextAttemptAt: i.sendAt ?? now,
    lockedAt: null,
    lockedBy: null,
    sentAt: null,
    lastError: null,
    dedupeKey: `${dedupeBase(i)}:${channel}`,
    createdAt: now,
  }));
  if (docs.length) await ctx.c.outbox.insertMany(docs, session ? { session } : {});
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

/** Lembretes da mentoria conforme as regras do evento (A7, até 10); sem regras configuradas, o padrão de RN15. */
export async function enqueueReminders(
  ctx: AppContext,
  session: ClientSession | undefined,
  mentee: Pick<MenteeDoc, '_id' | 'email' | 'phone'>,
  appointment: { _id: ObjectId; startAt: Date },
): Promise<void> {
  const ev = await ctx.c.events.findOne({ _id: ctx.config.eventId }, { session, projection: { reminders: 1 } });
  const rules = ev?.reminders?.length ? ev.reminders : DEFAULT_REMINDERS;
  for (const r of reminderSchedule(appointment.startAt, ctx.now(), rules)) {
    await enqueueMenteeNotifications(ctx, session, {
      type: 'reminder', mentee, appointmentId: appointment._id, sendAt: r.sendAt,
      channels: r.channels, dedupeSuffix: r.minutesBefore, payload: { minutesBefore: r.minutesBefore },
    });
  }
}
