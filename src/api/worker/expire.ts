import type { Db, MongoClient } from 'mongodb';
import type { Config } from '../config.js';
import { runTxn, type AppContext } from '../ctx.js';
import { applyTransition } from '../services/transitions.js';
import { workerContext } from './context.js';

const BATCH = 100;

/**
 * RN07 · marca como `expired` todo convite `invited` com `expiresAt` vencido; a participante volta para `waiting`
 * sem prioridade e recebe aviso (outbox `expired`). Uma transação por convite; seguro com várias réplicas: o filtro
 * condicional (`status`, `expiresAt <= now`) deixa só uma escrita vencer; a outra (ou E04 aceitando) não encontra o documento.
 */
export async function expireInvitesCtx(ctx: AppContext): Promise<{ expired: number }> {
  const now = ctx.now();
  const due = await ctx.c.appointments.find({ status: 'invited', expiresAt: { $lte: now } }, { projection: { _id: 1 } }).limit(BATCH).toArray();
  let expired = 0;
  for (const { _id } of due) {
    try {
      const res = await runTxn(ctx, (session) => applyTransition(ctx, session, { appointmentId: _id, action: 'expire', actor: { userId: null, role: 'system' } }));
      if (res) expired++;
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'falha ao expirar convite');
    }
  }
  return { expired };
}

export function expireInvites(db: Db, client: MongoClient, now: Date, config?: Partial<Config>): Promise<{ expired: number }> {
  return expireInvitesCtx(workerContext(db, client, () => now, config));
}
