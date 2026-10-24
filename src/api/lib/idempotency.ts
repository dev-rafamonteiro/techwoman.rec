import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import type { AppContext } from '../ctx.js';
import { AppError, isDuplicateKey } from './errors.js';

const ORPHAN_AFTER_MS = 30_000;

export interface IdemResponse {
  status: number;
  body: unknown;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export const requestHash = (route: string, params: unknown, body: unknown) =>
  createHash('sha256').update(`${route}|${canonical(params)}|${canonical(body)}`).digest('hex');

export interface IdemHandle {
  /** Grava a resposta como `done` dentro da transação de negócio (atomicidade com o commit). */
  markDone(session: ClientSession, response: IdemResponse): Promise<void>;
}

/**
 * Idempotency-Key (E04, E24, E26, E39): a chave fica 10 min (TTL) em `idempotency_keys`.
 * - mesma chave + mesmo pedido concluído: repete a resposta salva (header Idempotent-Replay);
 * - em andamento (< 30 s): 409 IDEMPOTENCY_IN_PROGRESS; órfã (>= 30 s): é retomada;
 * - mesma chave com outro pedido: 422 VALIDATION_ERROR;
 * - 5xx/erros transitórios apagam a chave; 2xx e erros de negócio (409 etc.) ficam salvos.
 */
export async function withIdempotency(
  ctx: AppContext,
  input: { principal: string; route: string; key: string; hash: string },
  run: (handle: IdemHandle) => Promise<IdemResponse>,
): Promise<IdemResponse & { replay: boolean }> {
  const coll = ctx.c.idempotencyKeys;
  const _id = `${input.principal}:${input.route}:${input.key}`;
  const now = ctx.now();
  try {
    await coll.insertOne({ _id, requestHash: input.hash, state: 'in_progress', response: null, createdAt: now });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const doc = await coll.findOne({ _id });
    if (!doc) return withIdempotency(ctx, input, run); // expirou entre o insert e a leitura
    if (doc.requestHash !== input.hash) {
      throw new AppError('VALIDATION_ERROR', 'Esta Idempotency-Key já foi usada em outro pedido.');
    }
    if (doc.state === 'done' && doc.response) return { ...doc.response, replay: true };
    if (now.getTime() - doc.createdAt.getTime() < ORPHAN_AFTER_MS) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Pedido em andamento, aguarde.', { headers: { 'Retry-After': '1' } });
    }
    const taken = await coll.findOneAndUpdate(
      { _id, state: 'in_progress', createdAt: doc.createdAt },
      { $set: { createdAt: now } },
    );
    if (!taken) throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Pedido em andamento, aguarde.', { headers: { 'Retry-After': '1' } });
  }

  const handle: IdemHandle = {
    async markDone(session, response) {
      await coll.updateOne({ _id }, { $set: { state: 'done', response } }, { session });
    },
  };
  try {
    const res = await run(handle);
    await coll.updateOne({ _id }, { $set: { state: 'done', response: res } });
    return { ...res, replay: false };
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      await coll.updateOne({ _id }, { $set: { state: 'done', response: { status: err.status, body: err.toBody() } } });
    } else {
      await coll.deleteOne({ _id }).catch(() => undefined);
    }
    throw err;
  }
}
