import type { Db } from 'mongodb';
import type { OutboxDoc } from '@tw/db';
import type { Config } from '../config.js';
import type { AppContext } from '../ctx.js';
import { shouldSendReminder } from '../domain/index.js';
import { NotifierError, type Notifier } from './notifier.js';
import { render } from './render.js';
import { workerContext } from './context.js';

/** Esperas entre tentativas (1 envio + 5 reenvios = 6 envios no total). */
export const BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 480_000] as const;
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
export const STUCK_AFTER_MS = 2 * 60_000;
export const CLAIM_BATCH = 50;

export interface OutboxResult {
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
}

/** Itens presos em `sending` há mais de 2 min voltam para `pending` (tentativas preservadas). */
export async function releaseStuck(ctx: AppContext): Promise<number> {
  const r = await ctx.c.outbox.updateMany(
    { status: 'sending', lockedAt: { $lt: new Date(ctx.now().getTime() - STUCK_AFTER_MS) } },
    { $set: { status: 'pending', lockedAt: null, lockedBy: null } },
  );
  return r.modifiedCount;
}

/** Decide se a mensagem ainda faz sentido (relê a mentoria). Devolve o motivo do descarte ou null. */
function skipReason(item: OutboxDoc, ctx: AppContext, appt: { status: string; expiresAt: Date | null } | null, menteeStatus: string | null): string | null {
  const lapsed = appt?.status === 'invited' && appt.expiresAt !== null && appt.expiresAt <= ctx.now();
  switch (item.type) {
    case 'invite':
      return appt?.status === 'invited' && !lapsed ? null : 'convite não está mais ativo';
    case 'confirmed':
    case 'moved':
      return appt && (appt.status === 'confirmed' || appt.status === 'in_progress') ? null : 'mentoria não está mais confirmada';
    case 'reminder':
      return shouldSendReminder(appt?.status ?? null) ? null : 'mentoria não está mais confirmada';
    case 'registered':
      return menteeStatus === 'cancelled' || menteeStatus === 'no_show' ? 'inscrição encerrada' : null;
    default:
      return null;
  }
}

async function handle(ctx: AppContext, item: OutboxDoc, notifier: Notifier, res: OutboxResult): Promise<void> {
  const { c } = ctx;
  const done = (set: Partial<OutboxDoc>) => c.outbox.updateOne({ _id: item._id, status: 'sending' }, { $set: set });
  const [event, mentee, appt] = await Promise.all([
    c.events.findOne({ _id: item.eventId }),
    item.menteeId ? c.mentees.findOne({ _id: item.menteeId }) : null,
    item.appointmentId ? c.appointments.findOne({ _id: item.appointmentId }) : null,
  ]);
  const reason = skipReason(item, ctx, appt, mentee?.status ?? null);
  if (reason || !event) {
    await done({ status: 'skipped', lastError: reason ?? 'evento não encontrado', payload: {} });
    res.skipped++;
    return;
  }
  const [mentor, table] = await Promise.all([appt ? c.users.findOne({ _id: appt.mentorId }) : null, appt ? c.tables.findOne({ _id: appt.tableId }) : null]);
  const { subject, text } = render({ item, event, mentee, appointment: appt, mentor, table, baseUrl: ctx.config.publicBaseUrl, menteeTokenSecret: ctx.config.menteeTokenSecret });
  try {
    await notifier.send({ channel: item.channel, to: item.to, type: item.type, text, subject, idempotencyKey: item.dedupeKey, payload: item.payload });
    await done({ status: 'sent', sentAt: ctx.now(), lastError: null, lockedAt: null, lockedBy: null, payload: {} });
    res.sent++;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    const permanent = err instanceof NotifierError && err.permanent;
    if (permanent || item.attempts >= MAX_ATTEMPTS) {
      // canal desligado por configuração não é falha: fica `skipped`
      const off = message.startsWith('canal ') && message.endsWith('desligado');
      await done({ status: off ? 'skipped' : 'failed', lastError: message, lockedAt: null, lockedBy: null });
      if (off) res.skipped++;
      else res.failed++;
    } else {
      const base = BACKOFF_MS[item.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
      const wait = Math.round(base * (1 + Math.random() * 0.1));
      await done({ status: 'pending', lastError: message, nextAttemptAt: new Date(ctx.now().getTime() + wait), lockedAt: null, lockedBy: null });
      res.retried++;
    }
  }
}

/**
 * Uma iteração do laço de 2 s: pega até 50 pendentes (claim atômico `pending` -> `sending`, cada item por um só
 * worker) e envia. Falha: até 6 envios no total com esperas de 30 s, 1, 2, 4 e 8 min; depois `failed` (A9: "Reenviar").
 */
export async function processOutboxCtx(ctx: AppContext, opts: { notifier: Notifier; workerId: string; isStopping?: () => boolean }): Promise<OutboxResult> {
  const res: OutboxResult = { sent: 0, failed: 0, skipped: 0, retried: 0 };
  for (let i = 0; i < CLAIM_BATCH; i++) {
    if (opts.isStopping?.()) break;
    const now = ctx.now();
    const item = await ctx.c.outbox.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { status: 'sending', lockedAt: now, lockedBy: opts.workerId }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
    );
    if (!item) break;
    await handle(ctx, item, opts.notifier, res);
  }
  return res;
}

export function processOutbox(
  db: Db,
  opts: { notifier: Notifier; now?: Date; workerId?: string; config?: Partial<Config> },
): Promise<OutboxResult> {
  const ctx = workerContext(db, db.client as never, () => opts.now ?? new Date(), opts.config);
  return releaseStuck(ctx).then(() => processOutboxCtx(ctx, { notifier: opts.notifier, workerId: opts.workerId ?? 'test-worker' }));
}
