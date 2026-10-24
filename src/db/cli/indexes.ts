import { connect } from '../client.js';
import { createIndexes } from '../indexes.js';
import { createSearchIndexes } from '../search-indexes.js';

const { client, db } = await connect();
try {
  await createIndexes(db);
  // --wait: espera os índices de busca ficarem prontos (a criação no Atlas é assíncrona)
  if (process.argv.includes('--wait')) await createSearchIndexes(db, { waitMs: 240_000 });
  console.log(`índices e validadores aplicados em "${db.databaseName}"`);
} finally {
  await client.close();
}
