import type { Db } from 'mongodb';
import type { OutboxDoc } from '@tw/db';
import type { Config } from '../config.js';
import type { AppContext } from '../ctx.js';
import { shouldSendReminder } from '../domain/index.js';
import { NotifierError, type Notifier, type NotifierMessage, type NotifierResult } from './notifier.js';
import { render } from './render.js';
import { openSecret } from '../lib/secret-box.js';
import { getOrCreateShortLink, shortLink, shortLinkExpireAt } from '../lib/short-links.js';
import { icsIdentity } from '../notifications/ics.js';
import { buildEmailMessage } from '../notifications/message.js';
import { RenderError } from '../notifications/render.js';
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
    case 'registration_cancelled':
      // se ela se inscreveu de novo antes do envio, o aviso de cancelamento não sai
      return menteeStatus === 'cancelled' ? null : 'inscrição não está mais cancelada';
    default:
      return null;
  }
}

/** Tipos cujo e-mail leva o `.ics` (layout 3). */
const WITH_ICS = new Set(['confirmed', 'moved', 'reminder']);

async function handle(ctx: AppContext, item: OutboxDoc, notifier: Notifier, res: OutboxResult): Promise<void> {
  const { c } = ctx;
  // estados finais apagam a senha cifrada da outbox (PLAN, "Senha provisória")
  const done = (set: Partial<OutboxDoc>, terminal = true) =>
    c.outbox.updateOne({ _id: item._id, status: 'sending' }, { $set: set, ...(terminal ? { $unset: { secret: '' as const } } : {}) });
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
  const fail = async (message: string) => {
    await done({ status: 'failed', lastError: message.slice(0, 300), lockedAt: null, lockedBy: null });
    res.failed++;
  };
  const [mentor, table, staffUser] = await Promise.all([
    appt ? c.users.findOne({ _id: appt.mentorId }) : null,
    appt ? c.tables.findOne({ _id: appt.tableId }) : null,
    item.userId ? c.users.findOne({ _id: item.userId }) : null,
  ]);
  // RN18: o lembrete marcado em `enqueueReminders` vai como List Message de presença; RN20: o convite também vai como
  // List Message (só o WAHA tem lista e resposta)
  const listable = item.channel === 'whatsapp' && ctx.config.whatsappTransport === 'waha' && !!appt && !!item.menteeId;
  const listKind: 'presence' | 'invite' | null = !listable ? null
    : item.type === 'reminder' && item.payload['presenceCheck'] === true ? 'presence'
    : item.type === 'invite' ? 'invite'
    : null;
  // links curtos (E48), uma vez por item e fora do try do render: erro de banco aqui sobe e o laço devolve o item
  // à fila (retry normal, não `failed`)
  const base = ctx.config.publicBaseUrl;
  const expireAt = shortLinkExpireAt(event);
  // `link_agenda` só existe no e-mail (layout 3)
  const links = mentee
    ? {
        personal: shortLink(base, await getOrCreateShortLink(c, mentee, 'personal', expireAt, ctx.now())),
        calendar: item.channel === 'email' && WITH_ICS.has(item.type) ? shortLink(base, await getOrCreateShortLink(c, mentee, 'calendar', expireAt, ctx.now())) : null,
      }
    : null;
  let message: Pick<NotifierMessage, 'subject' | 'text' | 'html' | 'attachments' | 'list'>;
  try {
    if (item.channel === 'email') {
      let provisionalPassword: string | null = null;
      if (item.type === 'staff_password') {
        if (!item.secret) return await fail('senha provisória indisponível; reenvie para gerar outra');
        try {
          provisionalPassword = openSecret(ctx.config.outboxKey, item.secret, item.dedupeKey);
        } catch {
          return await fail('senha provisória ilegível (chave da outbox diferente?)');
        }
      }
      const email = buildEmailMessage({
        item, event, mentee, appointment: appt, mentor, table, staffUser, provisionalPassword,
        baseUrl: ctx.config.publicBaseUrl,
        links,
        tempPasswordHours: ctx.config.tempPasswordHours,
        ics: appt && WITH_ICS.has(item.type) ? await icsIdentity(c.appointments, appt) : { uid: '', sequence: 0 },
      });
      message = { subject: email.subject, text: email.text, html: email.html, ...(email.attachments.length ? { attachments: email.attachments } : {}) };
    } else {
      message = render({ item, event, mentee, appointment: appt, mentor, table, links, baseUrl: ctx.config.publicBaseUrl, now: ctx.now(), ...(listKind ? { list: listKind } : {}) });
    }
  } catch (err) {
    if (err instanceof RenderError) return await fail(`render: ${err.message}`);
    throw err;
  }
  let sent: NotifierResult | void;
  try {
    sent = await notifier.send({ channel: item.channel, to: item.to, type: item.type, ...message, idempotencyKey: item.dedupeKey, payload: item.payload });
  } catch (err) {
    const text = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    const permanent = err instanceof NotifierError && err.permanent;
    if (permanent || item.attempts >= MAX_ATTEMPTS) {
      // canal desligado por configuração não é falha: fica `skipped`
      const off = text.startsWith('canal ') && text.endsWith('desligado');
      await done({ status: off ? 'skipped' : 'failed', lastError: text, lockedAt: null, lockedBy: null });
      if (off) res.skipped++;
      else res.failed++;
    } else {
      const base = BACKOFF_MS[item.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
      const wait = Math.round(base * (1 + Math.random() * 0.1));
      await done({ status: 'pending', lastError: text, nextAttemptAt: new Date(ctx.now().getTime() + wait), lockedAt: null, lockedBy: null }, false);
      res.retried++;
    }
    return;
  }
  if (listKind && message.list) {
    // a mensagem já saiu: falha ao gravar não pode devolver o item para a fila (sairia de novo). O lembrete de
    // presença substitui o registro do convite da mesma mentoria (RN20).
    try {
      await c.presenceChecks.replaceOne(
        { _id: appt!._id },
        { kind: listKind, menteeId: item.menteeId!, phone: item.to.replace(/\D/g, ''), messageId: sent?.providerMessageId ?? '', status: 'pending', sentAt: ctx.now(), answeredAt: null, answer: null },
        { upsert: true },
      );
    } catch (err) {
      ctx.log.error({ outboxId: String(item._id), err: (err as Error).message }, 'presence_checks não gravado');
    }
  }
  await done({ status: 'sent', sentAt: ctx.now(), lastError: null, lockedAt: null, lockedBy: null, payload: {} });
  res.sent++;
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
    try {
      await handle(ctx, item, opts.notifier, res);
    } catch (err) {
      // erro inesperado (ex.: banco ao criar o link curto) não derruba o lote: o item volta para a fila em 30 s
      ctx.log.error({ outboxId: String(item._id), err: (err as Error).message }, 'outbox: erro ao processar, nova tentativa');
      await ctx.c.outbox.updateOne(
        { _id: item._id, status: 'sending' },
        { $set: { status: 'pending', lockedAt: null, lockedBy: null, nextAttemptAt: new Date(now.getTime() + 30_000), lastError: (err as Error).message.slice(0, 300) } },
      );
      res.retried++;
    }
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
