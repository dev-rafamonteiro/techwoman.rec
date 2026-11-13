import { ObjectId, type Db } from 'mongodb';
import type { OutboxDoc } from '@tw/db';
import { ACTIVE_OUTBOX_CHANNELS, type OutboxChannel, type OutboxType } from '@tw/shared';
import type { Config } from '../config.js';
import type { AppContext } from '../ctx.js';
import { shouldSendReminder } from '../domain/index.js';
import { NotifierError, RateLimitError, type Notifier, type NotifierMessage } from './notifier.js';
import { isDuplicateKey } from '../lib/errors.js';
import { openSecret } from '../lib/secret-box.js';
import { getOrCreateShortLink, shortLink, shortLinkExpireAt } from '../lib/short-links.js';
import { icsIdentity } from '../notifications/ics.js';
import { buildEmailMessage } from '../notifications/message.js';
import { RenderError } from '../notifications/render.js';
import { workerContext } from './context.js';
import type { RateLimiters } from './rate-limit.js';

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
  /** Devolvidos à fila por limite do provedor (429), sem gastar tentativa. */
  rateLimited: number;
}

/**
 * Ordem de saída quando a fila acumula: primeiro o que expira em minutos (convite), depois o que muda a agenda de
 * alguém, depois os avisos que não têm hora. Tipos fora da lista saem por último.
 */
export const PRIORITY_TIERS: readonly (readonly OutboxType[])[] = [
  ['invite'],
  ['confirmed', 'moved', 'cancelled', 'expired', 'reminder', 'slot_released', 'mentor_slot_released', 'mentor_booked', 'mentor_cancel_request', 'registration_cancelled'],
  ['registered', 'staff_password', 'walk_in_done', 'walk_in_removed', 'mentor_availability_changed'],
];

/** Tempo máximo esperando a vez no limitador dentro de uma iteração (o resto fica para a próxima). */
const MAX_LIMITER_WAIT_MS = 2_000;

/** Itens presos em `sending` há mais de 2 min voltam para `pending` (tentativas preservadas). */
export async function releaseStuck(ctx: AppContext): Promise<number> {
  const r = await ctx.c.outbox.updateMany(
    { status: 'sending', lockedAt: { $lt: new Date(ctx.now().getTime() - STUCK_AFTER_MS) } },
    { $set: { status: 'pending', lockedAt: null, lockedBy: null } },
  );
  return r.modifiedCount;
}

/** Motivo gravado nos itens de canal desligado (WhatsApp, removido em 2026-11-05). */
export const CHANNEL_OFF_REASON = 'canal desativado';

/**
 * Itens antigos de canal que não existe mais (`whatsapp`) ainda pendentes viram `skipped`, sem envio nem nova
 * tentativa. Roda a cada iteração, antes do claim (que só olha os canais ativos); `releaseStuck` já devolveu a
 * `pending` os que ficaram presos em `sending`.
 *
 * Lembrete de regra só WhatsApp (gravado antes de 2026-11-05) não tinha item irmão no e-mail: antes de descartar,
 * ganha uma cópia no e-mail no mesmo horário, para a mentoria confirmada não perder o lembrete. Os demais tipos
 * sempre saíam também por e-mail (ou eram respostas do WhatsApp, sem equivalente).
 */
export async function skipInactiveChannels(ctx: AppContext): Promise<number> {
  const orphans = await ctx.c.outbox
    .find({ status: 'pending', type: 'reminder', channel: { $nin: [...ACTIVE_OUTBOX_CHANNELS] } })
    .toArray();
  for (const item of orphans) {
    const dedupeKey = item.dedupeKey.replace(/:[^:]+$/, ':email');
    if (dedupeKey === item.dedupeKey || (await ctx.c.outbox.countDocuments({ dedupeKey }, { limit: 1 }))) continue;
    const mentee = item.menteeId ? await ctx.c.mentees.findOne({ _id: item.menteeId }, { projection: { email: 1 } }) : null;
    if (!mentee?.email) continue;
    const { presenceCheck: _presence, ...payload } = item.payload ?? {};
    try {
      await ctx.c.outbox.insertOne({
        ...item,
        _id: new ObjectId(),
        channel: 'email',
        to: mentee.email,
        payload,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        sentAt: null,
        lastError: null,
        dedupeKey,
        createdAt: ctx.now(),
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err; // outro worker já criou a cópia
    }
  }
  const r = await ctx.c.outbox.updateMany(
    { status: 'pending', channel: { $nin: [...ACTIVE_OUTBOX_CHANNELS] } },
    { $set: { status: 'skipped', lastError: CHANNEL_OFF_REASON, lockedAt: null, lockedBy: null, payload: {} }, $unset: { secret: '' } },
  );
  return r.modifiedCount;
}

/** Decide se a mensagem ainda faz sentido (relê a mentoria). Devolve o motivo do descarte ou null. */
function skipReason(
  item: OutboxDoc,
  ctx: AppContext,
  appt: { status: string; expiresAt: Date | null } | null,
  menteeStatus: string | null,
  walkIn: { deletedAt: Date | null } | null,
): string | null {
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
    case 'slot_released':
      // já recebeu outro convite, foi confirmada ou cancelou antes do envio: o aviso de horário liberado não sai
      return menteeStatus === 'waiting' ? null : 'participante não está mais na fila';
    case 'walk_in_done':
      // RN21: atendimento removido pelo admin (ou inscrição desfeita) antes do envio: o agradecimento não sai
      if (!walkIn || walkIn.deletedAt) return 'atendimento fora da mesa removido';
      return menteeStatus === 'done' ? null : 'participante não está mais atendida';
    case 'walk_in_removed':
      // se ela já se inscreveu de novo antes do envio, o pedido de nova inscrição não sai
      return menteeStatus === 'cancelled' ? null : 'participante já se inscreveu de novo';
    case 'mentor_slot_released':
      // aviso à mentora: o horário já foi liberado na transação; só precisa da mentoria para montar o texto
      return appt ? null : 'mentoria não encontrada';
    case 'mentor_booked':
      // se a participante já desfez o agendamento, a mentora recebe só o aviso de horário liberado
      return appt?.status === 'confirmed' ? null : 'mentoria não está mais confirmada';
    case 'mentor_cancel_request':
      // RN25: cancelada (por outra administradora ou pela participante) ou já começou antes do envio: o pedido não sai
      return appt && (appt.status === 'invited' || appt.status === 'confirmed') ? null : 'mentoria não está mais ativa';
    default:
      return null;
  }
}

/** Tipos cujo e-mail leva o `.ics` (layout 3). */
const WITH_ICS = new Set(['confirmed', 'moved', 'reminder']);

/** Devolve `pauseMs` quando o provedor pediu para esperar (429): o canal para até lá. */
async function handle(ctx: AppContext, item: OutboxDoc, notifier: Notifier, res: OutboxResult): Promise<{ pauseMs: number } | void> {
  const { c } = ctx;
  // estados finais apagam a senha cifrada da outbox (PLAN, "Senha provisória")
  const done = (set: Partial<OutboxDoc>, terminal = true) =>
    c.outbox.updateOne({ _id: item._id, status: 'sending' }, { $set: set, ...(terminal ? { $unset: { secret: '' as const } } : {}) });
  // canal desligado (item antigo de `whatsapp` que escapou de `skipInactiveChannels`): descarta sem enviar
  if (item.channel !== 'email') {
    await done({ status: 'skipped', lastError: CHANNEL_OFF_REASON, lockedAt: null, lockedBy: null, payload: {} });
    res.skipped++;
    return;
  }
  // RN21: atendimento fora da mesa do e-mail (`payload.walkInId`): diz se ainda vale e quem é a mentora (layout 10)
  const walkInId = item.type === 'walk_in_done' && typeof item.payload?.['walkInId'] === 'string' && ObjectId.isValid(item.payload['walkInId']) ? new ObjectId(item.payload['walkInId']) : null;
  const [event, mentee, appt, walkIn] = await Promise.all([
    c.events.findOne({ _id: item.eventId }),
    item.menteeId ? c.mentees.findOne({ _id: item.menteeId }) : null,
    item.appointmentId ? c.appointments.findOne({ _id: item.appointmentId }) : null,
    walkInId ? c.walkIns.findOne({ _id: walkInId }) : null,
  ]);
  const reason = skipReason(item, ctx, appt, mentee?.status ?? null, walkIn);
  if (reason || !event) {
    await done({ status: 'skipped', lastError: reason ?? 'evento não encontrado', payload: {} });
    res.skipped++;
    return;
  }
  const fail = async (message: string) => {
    await done({ status: 'failed', lastError: message.slice(0, 300), lockedAt: null, lockedBy: null });
    res.failed++;
  };
  const [mentor, table, staffUser, apptMentee] = await Promise.all([
    appt ? c.users.findOne({ _id: appt.mentorId }) : walkIn ? c.users.findOne({ _id: walkIn.mentorId }) : null,
    appt ? c.tables.findOne({ _id: appt.tableId }) : null,
    // destinatária do layout 6; no aviso à mentora `userId` é a própria mentora, já lida acima
    item.type === 'staff_password' && item.userId ? c.users.findOne({ _id: item.userId }) : null,
    // aviso à mentora: o item não tem `menteeId` (sem links com o token dela); o nome vem da mentoria
    (item.type === 'mentor_slot_released' || item.type === 'mentor_booked' || item.type === 'mentor_cancel_request') && appt ? c.mentees.findOne({ _id: appt.menteeId }, { projection: { name: 1 } }) : null,
  ]);
  // links curtos (E48), uma vez por item e fora do try do render: erro de banco aqui sobe e o laço devolve o item
  // à fila (retry normal, não `failed`)
  const base = ctx.config.publicBaseUrl;
  const expireAt = shortLinkExpireAt(event);
  // `link_agenda` só nos layouts com `.ics` (layout 3)
  const links = mentee
    ? {
        personal: shortLink(base, await getOrCreateShortLink(c, mentee, 'personal', expireAt, ctx.now())),
        calendar: WITH_ICS.has(item.type) ? shortLink(base, await getOrCreateShortLink(c, mentee, 'calendar', expireAt, ctx.now())) : null,
      }
    : null;
  let message: Pick<NotifierMessage, 'subject' | 'text' | 'html' | 'attachments'>;
  try {
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
      item, event, mentee: mentee ?? apptMentee, appointment: appt, mentor, table, staffUser, provisionalPassword,
      baseUrl: ctx.config.publicBaseUrl,
      links,
      tempPasswordHours: ctx.config.tempPasswordHours,
      ics: appt && WITH_ICS.has(item.type) ? await icsIdentity(c.appointments, appt) : { uid: '', sequence: 0 },
    });
    message = { subject: email.subject, text: email.text, html: email.html, ...(email.attachments.length ? { attachments: email.attachments } : {}) };
  } catch (err) {
    if (err instanceof RenderError) return await fail(`render: ${err.message}`);
    throw err;
  }
  try {
    await notifier.send({ channel: item.channel, to: item.to, type: item.type, ...message, idempotencyKey: item.dedupeKey, payload: item.payload });
  } catch (err) {
    const text = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    if (err instanceof RateLimitError) {
      // limite do provedor não é falha da mensagem: volta para a fila sem contar a tentativa feita no claim
      await c.outbox.updateOne(
        { _id: item._id, status: 'sending' },
        { $set: { status: 'pending', lastError: text, nextAttemptAt: new Date(ctx.now().getTime() + err.retryAfterMs), lockedAt: null, lockedBy: null }, $inc: { attempts: -1 } },
      );
      res.rateLimited++;
      return { pauseMs: err.retryAfterMs };
    }
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
  await done({ status: 'sent', sentAt: ctx.now(), lastError: null, lockedAt: null, lockedBy: null, payload: {} });
  res.sent++;
}

/** Claim atômico `pending` -> `sending` do próximo item vencido do canal, na ordem de PRIORITY_TIERS. */
async function claim(ctx: AppContext, channel: OutboxChannel, workerId: string): Promise<OutboxDoc | null> {
  const now = ctx.now();
  const update = { $set: { status: 'sending' as const, lockedAt: now, lockedBy: workerId }, $inc: { attempts: 1 } };
  const opts = { sort: { nextAttemptAt: 1 }, returnDocument: 'after' } as const;
  for (const tier of PRIORITY_TIERS) {
    const item = await ctx.c.outbox.findOneAndUpdate({ status: 'pending', channel, type: { $in: [...tier] }, nextAttemptAt: { $lte: now } }, update, opts);
    if (item) return item;
  }
  // tipos novos fora das faixas não ficam parados
  return ctx.c.outbox.findOneAndUpdate({ status: 'pending', channel, nextAttemptAt: { $lte: now } }, update, opts);
}

export interface OutboxRunOptions {
  notifier: Notifier;
  workerId: string;
  isStopping?: () => boolean;
  limiters?: RateLimiters;
  /** Envios simultâneos por canal (padrão 1). O ritmo continua sendo o do limitador; isto só cobre a latência do provedor. */
  concurrency?: Partial<Record<OutboxChannel, number>>;
}

/** Um canal: até CLAIM_BATCH itens, no ritmo do limitador do canal; um 429 pausa só este canal. */
async function processLane(ctx: AppContext, channel: OutboxChannel, opts: OutboxRunOptions, res: OutboxResult): Promise<void> {
  const limiter = opts.limiters?.[channel];
  let budget = CLAIM_BATCH;
  let stop = false;
  const one = async () => {
    while (!stop && budget-- > 0) {
      if (opts.isStopping?.()) break;
      // espera a vez antes do claim: o item não fica preso em `sending` enquanto o canal está segurando
      if (limiter && !(await limiter.take({ maxWaitMs: MAX_LIMITER_WAIT_MS, isStopping: () => stop || !!opts.isStopping?.() }))) break;
      const item = await claim(ctx, channel, opts.workerId);
      if (!item) break;
      if (!(await sendOne(ctx, channel, item, opts, limiter, res))) stop = true;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency?.[channel] ?? 1) }, one));
}

/** Envia um item já reservado. Devolve false quando o canal deve parar nesta iteração (429). */
async function sendOne(ctx: AppContext, channel: OutboxChannel, item: OutboxDoc, opts: OutboxRunOptions, limiter: RateLimiters[OutboxChannel], res: OutboxResult): Promise<boolean> {
  try {
    const r = await handle(ctx, item, opts.notifier, res);
    if (r?.pauseMs !== undefined) {
      limiter?.pause(r.pauseMs);
      ctx.log.warn({ channel, pauseMs: r.pauseMs }, 'outbox: limite do provedor, canal pausado');
      return false;
    }
  } catch (err) {
    // erro inesperado (ex.: banco ao criar o link curto) não derruba o lote: o item volta para a fila em 30 s
    ctx.log.error({ outboxId: String(item._id), err: (err as Error).message }, 'outbox: erro ao processar, nova tentativa');
    await ctx.c.outbox.updateOne(
      { _id: item._id, status: 'sending' },
      { $set: { status: 'pending', lockedAt: null, lockedBy: null, nextAttemptAt: new Date(ctx.now().getTime() + 30_000), lastError: (err as Error).message.slice(0, 300) } },
    );
    res.retried++;
  }
  return true;
}

/**
 * Uma iteração do laço de 2 s: um lote por canal ativo (só e-mail), com até 50 itens (claim atômico `pending` ->
 * `sending`, cada item por um só worker), em ordem de prioridade e no ritmo do limitador do canal. Falha: até 6 envios
 * no total com esperas de 30 s, 1, 2, 4 e 8 min; depois `failed` (A9: "Reenviar"). Limite do provedor (429) não conta.
 */
export async function processOutboxCtx(ctx: AppContext, opts: OutboxRunOptions): Promise<OutboxResult> {
  const res: OutboxResult = { sent: 0, failed: 0, skipped: 0, retried: 0, rateLimited: 0 };
  res.skipped += await skipInactiveChannels(ctx);
  await Promise.all(ACTIVE_OUTBOX_CHANNELS.map((ch) => processLane(ctx, ch, opts, res)));
  return res;
}

export function processOutbox(
  db: Db,
  opts: { notifier: Notifier; now?: Date; workerId?: string; config?: Partial<Config> } & Pick<OutboxRunOptions, 'limiters' | 'concurrency'>,
): Promise<OutboxResult> {
  const ctx = workerContext(db, db.client as never, () => opts.now ?? new Date(), opts.config);
  const extra = { ...(opts.limiters ? { limiters: opts.limiters } : {}), ...(opts.concurrency ? { concurrency: opts.concurrency } : {}) };
  return releaseStuck(ctx).then(() => processOutboxCtx(ctx, { notifier: opts.notifier, workerId: opts.workerId ?? 'test-worker', ...extra }));
}
