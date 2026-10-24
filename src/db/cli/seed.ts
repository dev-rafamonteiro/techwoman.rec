import { DEFAULT_EVENT_ID, connect } from '../client.js';
import { seedEvent, seedTables } from '../event.js';
import { createIndexes } from '../indexes.js';
import { seedSuperAdmin } from '../seed-super-admin.js';

// Seed de desenvolvimento: índices, evento, 20 mesas e (se SUPER_ADMIN_EMAIL estiver definido) o super admin.
const { client, db } = await connect();
try {
  await createIndexes(db);
  const eventId = process.env['EVENT_ID'] ?? DEFAULT_EVENT_ID;
  const event = await seedEvent(db, {
    _id: eventId,
    ...(process.env['EVENT_DATE'] ? { date: process.env['EVENT_DATE'] } : {}),
    registrationOpen: process.env['SEED_REGISTRATION_OPEN'] !== 'false',
  });
  const tables = await seedTables(db, eventId, Number(process.env['SEED_TABLES'] ?? 20));
  console.log(`evento "${event._id}" (${event.slots.length} horários), ${tables} mesas novas`);
  const email = process.env['SUPER_ADMIN_EMAIL'];
  if (email) {
    const r = await seedSuperAdmin(db, {
      email,
      name: process.env['SUPER_ADMIN_NAME'] ?? 'Super admin',
      ...(process.env['SUPER_ADMIN_PASSWORD'] ? { password: process.env['SUPER_ADMIN_PASSWORD'] } : {}),
    });
    console.log(r.created ? `super admin criado: ${r.email}` : `super admin já existe: ${r.email}`);
    if (r.generatedPassword) console.log(`senha provisória (mostrada uma única vez): ${r.generatedPassword}`);
  } else {
    console.log('SUPER_ADMIN_EMAIL não definido: super admin não criado (npm run -w @tw/db seed:super-admin).');
  }
} finally {
  await client.close();
}
