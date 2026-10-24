import type { Db, MongoClient } from 'mongodb';
import { loadConfig, type Config } from '../config.js';
import { makeContext, type AppContext } from '../ctx.js';

const silent = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return silent; }, level: 'silent', silent() {} } as never;

/** Contexto mínimo para as rotinas do worker (e para o tester chamar expireInvites/processOutbox diretamente). */
export function workerContext(db: Db, client: MongoClient, now: () => Date, config?: Partial<Config>, log?: AppContext['log']): AppContext {
  return makeContext({ client, db, config: { ...loadConfig(), ...config }, log: log ?? silent, now });
}
