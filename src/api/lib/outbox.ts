import type { ClientSession, ObjectId } from 'mongodb';
import type { OutboxChannel, OutboxType } from '@tw/shared';
import type { MenteeDoc, OutboxDoc, UserDoc } from '@tw/db';
import { ObjectId as Oid } from 'mongodb';
import type { AppContext } from '../ctx.js';

/**
 * Canais por tipo (PLAN, "Notificações"): e-mail é o canal obrigatório; WhatsApp só se ligado e houver telefone.
 * Lembrete: WhatsApp (e-mail se não houver). Expirado: só e-mail.
 */
export function channelsFor(ctx: AppContext, type: OutboxType, mentee: Pick<MenteeDoc, 'phone'> | null): OutboxChannel[] {
  const wa = ctx.config.whatsappEnabled && !!mentee?.phone;
  if (type === 'expired' || type === 'staff_password') return ['email'];
  if (type === 'reminder') return wa ? ['whatsapp'] : ['email'];
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
}

function dedupeBase(i: EnqueueInput): string {
  if (i.type === 'registered') return `registered:${i.mentee._id}:${i.dedupeSuffix ?? 0}`;
  return `${i.type}:${i.appointmentId ?? i.mentee._id}`;
}

/** Grava as mensagens na outbox, na mesma transação da mudança de status (padrão outbox). */
export async function enqueueMenteeNotifications(ctx: AppContext, session: ClientSession | undefined, i: EnqueueInput): Promise<void> {
  const now = ctx.now();
  const docs: OutboxDoc[] = channelsFor(ctx, i.type, i.mentee).map((channel) => ({
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

/** Senha provisória enviada por e-mail (dedupeKey `pwd:<userId>:<n>`). A senha vai no payload até o envio e é apagada. */
export async function enqueueStaffPassword(
  ctx: AppContext,
  session: ClientSession | undefined,
  user: Pick<UserDoc, '_id' | 'email' | 'name'>,
  n: number,
  provisionalPassword: string,
): Promise<void> {
  const now = ctx.now();
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
      payload: { provisionalPassword },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      lockedAt: null,
      lockedBy: null,
      sentAt: null,
      lastError: null,
      dedupeKey: `pwd:${user._id}:${n}`,
      createdAt: now,
    },
    session ? { session } : {},
  );
}
