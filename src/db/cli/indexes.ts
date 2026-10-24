import { connect } from '../client.js';
import { createIndexes } from '../indexes.js';

const { client, db } = await connect();
try {
  await createIndexes(db);
  console.log(`índices e validadores aplicados em "${db.databaseName}"`);
} finally {
  await client.close();
}
