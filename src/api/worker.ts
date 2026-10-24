import { utimesSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import { connect, createIndexes, readEnv } from '@tw/db';
import { loadConfig } from './config.js';
import { makeContext } from './ctx.js';
import { expireInvitesCtx } from './worker/expire.js';
import { notifierFromEnv } from './worker/notifier.js';
import { processOutboxCtx, releaseStuck } from './worker/outbox.js';

export const HEARTBEAT_FILE = '/tmp/worker-alive';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const config = loadConfig(process.env, 'worker');
const { client, db } = await connect({ ...(config.mongoUri ? { uri: config.mongoUri } : {}), ...(config.mongoDb ? { dbName: config.mongoDb } : {}) });
await createIndexes(db);
const ctx = makeContext({ client, db, config, log: log as never });
const notifier = notifierFromEnv(process.env, (n) => readEnv(n), (o, m) => log.info(o, m));
const workerId = `${process.env['HOSTNAME'] ?? 'worker'}-${process.pid}`;

let stopping = false;
let busy: Promise<void> = Promise.resolve();
try { writeFileSync(HEARTBEAT_FILE, ''); } catch { /* fs somente leitura fora de /tmp */ }
const beat = () => { try { utimesSync(HEARTBEAT_FILE, new Date(), new Date()); } catch { /* ignora */ } };

async function outboxTick() {
  const r = await processOutboxCtx(ctx, { notifier, workerId, isStopping: () => stopping });
  if (r.sent || r.failed || r.skipped || r.retried) log.info(r, 'outbox');
}
async function slowTick() {
  const [e, released] = await Promise.all([expireInvitesCtx(ctx), releaseStuck(ctx)]);
  if (e.expired || released) log.info({ expired: e.expired, released }, 'expiração/recuperação');
}

function every(ms: number, fn: () => Promise<void>) {
  let running = false;
  const t = setInterval(() => {
    if (stopping || running) return;
    running = true;
    const p = fn().catch((err) => log.error({ err: (err as Error).message }, 'falha no laço')).finally(() => { running = false; });
    busy = busy.then(() => p);
  }, ms);
  t.unref();
  return t;
}
const timers = [every(2000, async () => { beat(); await outboxTick(); }), every(30_000, slowTick)];
log.info({ workerId }, 'worker iniciado');

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker encerrando');
  timers.forEach(clearInterval);
  await busy.catch(() => undefined);
  // o que ficou em `sending` por esta réplica volta para a fila
  await ctx.c.outbox.updateMany({ status: 'sending', lockedBy: workerId }, { $set: { status: 'pending', lockedAt: null, lockedBy: null } }).catch(() => undefined);
  await client.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
