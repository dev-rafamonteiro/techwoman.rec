import { readFile } from 'node:fs/promises';
import { DEFAULT_EVENT_ID, connect } from '../client.js';
import { importMentors } from '../import-mentors.js';
import { createIndexes } from '../indexes.js';
import { getCollections } from '../collections.js';

// Uso: npm run -w @tw/db import:mentoras -- caminho.csv [--apply] [--update]
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Uso: import:mentoras -- <arquivo.csv> [--apply] [--update]');
  process.exit(1);
}
const { client, db } = await connect();
try {
  await createIndexes(db);
  const event = await getCollections(db).events.findOne({ _id: process.env['EVENT_ID'] ?? DEFAULT_EVENT_ID });
  if (!event) throw new Error('Evento não encontrado; rode o seed antes.');
  const res = await importMentors(db, await readFile(file, 'utf8'), {
    event,
    dryRun: !args.includes('--apply'),
    onExisting: args.includes('--update') ? 'update' : 'skip',
  });
  console.log(res.dryRun ? 'PRÉVIA (nada gravado; use --apply)' : 'IMPORTADO');
  console.log(JSON.stringify(res.summary));
  for (const r of res.rows.filter((r) => r.status === 'error')) console.log(`linha ${r.line}: ${r.errors.join(' ')}`);
  for (const c of res.credentials) console.log(`${c.email};${c.provisionalPassword}`);
} finally {
  await client.close();
}
