import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { getCollections, type Collections, type EventDoc } from '@tw/db';
import type { Config } from './config.js';
import { AppError } from './lib/errors.js';
import type { StreamHub } from './lib/stream-hub.js';

export interface AppContext {
  client: MongoClient;
  db: Db;
  c: Collections;
  config: Config;
  /** Relógio injetável (testes). */
  now: () => Date;
  log: FastifyBaseLogger;
  hub: StreamHub | null;
}

export function makeContext(init: {
  client: MongoClient;
  db: Db;
  config: Config;
  log: FastifyBaseLogger;
  now?: () => Date;
}): AppContext {
  return {
    client: init.client,
    db: init.db,
    c: getCollections(init.db),
    config: init.config,
    now: init.now ?? (() => new Date()),
    log: init.log,
    hub: null,
  };
}

const TXN_DEADLINE_MS = 8000;

/**
 * Transação com readConcern snapshot e writeConcern majority. `withTransaction` repete sozinho em
 * TransientTransactionError/UnknownTransactionCommitResult dentro do prazo (8 s por requisição).
 * O callback pode rodar mais de uma vez: só deve ter efeitos no banco, via `session`.
 */
export async function runTxn<T>(ctx: AppContext, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = ctx.client.startSession();
  const started = Date.now();
  let result!: T;
  try {
    await session.withTransaction(
      async () => {
        if (Date.now() - started > TXN_DEADLINE_MS) {
          throw new AppError('INTERNAL', 'Servidor ocupado, tente novamente.', { status: 503, headers: { 'Retry-After': '1' } });
        }
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: 5000,
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

export async function loadEvent(ctx: AppContext, session?: ClientSession): Promise<EventDoc> {
  const ev = await ctx.c.events.findOne({ _id: ctx.config.eventId }, session ? { session } : {});
  if (!ev) throw new AppError('INTERNAL', 'Evento não configurado.', { status: 503 });
  return ev;
}
