import { connect, createIndexes } from '@tw/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { client, db } = await connect({ ...(config.mongoUri ? { uri: config.mongoUri } : {}), ...(config.mongoDb ? { dbName: config.mongoDb } : {}) });
await createIndexes(db); // idempotente, a cada start

const { app } = await buildApp({ config, client, db });
await app.listen({ port: config.port, host: config.host });

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'encerrando');
  try {
    await app.close();
    await client.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
