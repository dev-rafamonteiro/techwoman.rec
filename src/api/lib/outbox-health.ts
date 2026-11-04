import { OUTBOX_CHANNELS, type E44HealthResponse, type OutboxLaneHealth } from '@tw/shared';
import type { AppContext } from '../ctx.js';

/** Item vencido esperando mais que isso = fila travada ou lenta (A9 e log do worker). */
export const OUTBOX_ALERT_AFTER_SECONDS = 120;

/** Saúde da fila por canal (E44 health e alerta do worker). */
export async function outboxHealth(ctx: AppContext): Promise<E44HealthResponse> {
  const now = ctx.now();
  const eventId = ctx.config.eventId;
  const [counts, oldest, limited] = await Promise.all([
    ctx.c.outbox
      .aggregate<{ _id: { ch: string; k: string }; n: number }>([
        { $match: { eventId, status: { $in: ['pending', 'sending', 'failed'] } } },
        { $group: { _id: { ch: '$channel', k: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $gt: ['$nextAttemptAt', now] }] }, 'scheduled', '$status'] } }, n: { $sum: 1 } } },
      ])
      .toArray(),
    Promise.all(OUTBOX_CHANNELS.map((channel) => ctx.c.outbox.findOne({ eventId, status: 'pending', channel, nextAttemptAt: { $lte: now } }, { sort: { nextAttemptAt: 1 }, projection: { nextAttemptAt: 1 } }))),
    Promise.all(OUTBOX_CHANNELS.map((channel) => ctx.c.outbox.countDocuments({ eventId, status: 'pending', channel, lastError: /^HTTP 429|rate exceeded|throttl/i }, { limit: 1 }))),
  ]);
  const n = (ch: string, k: string) => counts.find((c) => c._id.ch === ch && c._id.k === k)?.n ?? 0;
  const channels: OutboxLaneHealth[] = OUTBOX_CHANNELS.map((channel, i) => {
    const o = oldest[i];
    return {
      channel,
      due: n(channel, 'pending'),
      scheduled: n(channel, 'scheduled'),
      sending: n(channel, 'sending'),
      failed: n(channel, 'failed'),
      oldestDueSeconds: o?.nextAttemptAt ? Math.max(0, Math.floor((now.getTime() - o.nextAttemptAt.getTime()) / 1000)) : 0,
      rateLimited: (limited[i] ?? 0) > 0,
    };
  });
  return { ok: channels.every((c) => c.oldestDueSeconds <= OUTBOX_ALERT_AFTER_SECONDS), alertAfterSeconds: OUTBOX_ALERT_AFTER_SECONDS, channels };
}
