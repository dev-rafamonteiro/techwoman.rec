import { DEFAULT_EVENT_ID, connect } from '../client.js';
import { clearDemo, hasDemo, seedDemo } from '../demo.js';
import { readEnv } from '../env.js';
import { generateProvisionalPassword } from '../password.js';

// Massa de demonstração (rode antes `npm run db:seed`). `--reset` apaga a massa anterior e recria.
// DEMO_PASSWORD define a senha comum de coordenação e mentoras; sem ela, uma é gerada e mostrada uma única vez.
// DEMO_EMAIL_TEMPLATE troca os e-mails (padrão: delivered+{slug}@resend.dev); ex.: voce+{slug}@gmail.com.
const { client, db } = await connect();
try {
  const eventId = process.env['EVENT_ID'] ?? DEFAULT_EVENT_ID;
  const secret = readEnv('MENTEE_TOKEN_SECRET');
  if (!secret) throw new Error('MENTEE_TOKEN_SECRET não definida (use o mesmo valor da API)');
  const event = await db.collection('events').findOne({ _id: eventId as never });
  if (!event) throw new Error(`evento "${eventId}" não existe: rode antes npm run db:seed`);
  const template = process.env['DEMO_EMAIL_TEMPLATE'];
  if (process.argv.includes('--reset')) console.log(`massa anterior removida: ${await clearDemo(db, eventId, template)} registros`);
  else if (await hasDemo(db, eventId, template)) {
    console.log('massa de demonstração já carregada (use --reset para recriar)');
    process.exit(0);
  }
  const password = process.env['DEMO_PASSWORD'] || generateProvisionalPassword();
  const r = await seedDemo(db, { event: event as never, password, menteeTokenSecret: secret, ...(template ? { emailTemplate: template } : {}) });
  const base = process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:8080';
  console.log(`evento "${eventId}": ${r.mentors.length} mentoras, ${r.mentees} participantes, ${r.appointments} mentorias`);
  console.log(`coordenação: ${r.admins.join(', ')}`);
  console.log(`mentoras: ${r.mentors.join(', ')}`);
  if (!process.env['DEMO_PASSWORD']) console.log(`senha de todas (mostrada uma única vez): ${password}`);
  for (const l of r.links) console.log(`link pessoal (${l.status}) ${l.name}: ${base}${l.path}`);
} finally {
  await client.close();
}
