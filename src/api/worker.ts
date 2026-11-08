import { utimesSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import { connect, createIndexes, readEnv } from '@tw/db';
import { loadConfig } from './config.js';
import { makeContext } from './ctx.js';
import { expireInvitesCtx } from './worker/expire.js';
import { notifierFromEnv } from './worker/notifier.js';
import { processOutboxCtx, releaseStuck } from './worker/outbox.js';
import { concurrencyFromEnv, rateLimitersFromEnv } from './worker/rate-limit.js';
import { outboxHealth } from './lib/outbox-health.js';

export const HEARTBEAT_FILE = '/tmp/worker-alive';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const config = loadConfig(process.env, 'worker');
const { client, db } = await connect({ ...(config.mongoUri ? { uri: config.mongoUri } : {}), ...(config.mongoDb ? { dbName: config.mongoDb } : {}) });
await createIndexes(db);
const ctx = makeContext({ client, db, config, log: log as never });
const notifier = notifierFromEnv(process.env, (n) => readEnv(n), (o, m) => log.info(o, m));
// limites por canal valem para o processo inteiro (persistem entre as iterações do laço)
const limiters = rateLimitersFromEnv(process.env);
const concurrency = concurrencyFromEnv(process.env);
const workerId = `${process.env['HOSTNAME'] ?? 'worker'}-${process.pid}`;

let stopping = false;
let busy: Promise<void> = Promise.resolve();
try { writeFileSync(HEARTBEAT_FILE, ''); } catch { /* fs somente leitura fora de /tmp */ }
const beat = () => { try { utimesSync(HEARTBEAT_FILE, new Date(), new Date()); } catch { /* ignora */ } };

async function outboxTick() {
  const r = await processOutboxCtx(ctx, { notifier, workerId, isStopping: () => stopping, limiters, concurrency });
  if (r.sent || r.failed || r.skipped || r.retried || r.rateLimited) log.info(r, 'outbox');
}
async function slowTick() {
  const [e, released] = await Promise.all([expireInvitesCtx(ctx), releaseStuck(ctx)]);
  if (e.expired || released) log.info({ expired: e.expired, released }, 'expiração/recuperação');
  // fila andando devagar ou parada (cota do provedor, provedor fora): aviso no log a cada 30 s até normalizar
  const h = await outboxHealth(ctx);
  if (!h.ok) log.warn({ channels: h.channels.filter((c) => c.oldestDueSeconds > h.alertAfterSeconds) }, 'outbox: fila atrasada');
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
log.info({ workerId, concurrency, perSec: Object.fromEntries(Object.entries(limiters).map(([k, l]) => [k, l.perSec])) }, 'worker iniciado');

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
