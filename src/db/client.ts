import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { readEnv } from './env.js';

export const DEFAULT_DB_NAME = 'techwoman';
export const DEFAULT_EVENT_ID = 'techwoman-2026';

/**
 * Conecta ao MongoDB. A URI vem sempre de variável de ambiente (nunca é registrada em log).
 * Nome do banco: MONGODB_DB, ou o do path da URI, ou "techwoman".
 */
export async function connect(opts: { uri?: string; dbName?: string; options?: MongoClientOptions } = {}): Promise<{
  client: MongoClient;
  db: Db;
}> {
  const uri = opts.uri ?? readEnv('MONGODB_URI');
  if (!uri) throw new Error('MONGODB_URI (ou MONGODB_URI_FILE) não definida');
  const client = new MongoClient(uri, {
    appName: 'techwoman',
    retryWrites: true,
    writeConcern: { w: 'majority' },
    readConcern: { level: 'majority' },
    ...opts.options,
  });
  await client.connect();
  const dbName = opts.dbName ?? readEnv('MONGODB_DB') ?? (client.options.dbName !== 'test' ? client.options.dbName : undefined) ?? DEFAULT_DB_NAME;
  return { client, db: client.db(dbName) };
}
