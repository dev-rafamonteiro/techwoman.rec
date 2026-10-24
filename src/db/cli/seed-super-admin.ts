import { connect } from '../client.js';
import { createIndexes } from '../indexes.js';
import { seedSuperAdmin } from '../seed-super-admin.js';

// Credenciais só por ambiente: SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, SUPER_ADMIN_PASSWORD (opcional).
const email = process.env['SUPER_ADMIN_EMAIL'];
if (!email) {
  console.error('Defina SUPER_ADMIN_EMAIL (e opcionalmente SUPER_ADMIN_NAME e SUPER_ADMIN_PASSWORD).');
  process.exit(1);
}
const { client, db } = await connect();
try {
  await createIndexes(db);
  const r = await seedSuperAdmin(db, {
    email,
    name: process.env['SUPER_ADMIN_NAME'] ?? 'Super admin',
    ...(process.env['SUPER_ADMIN_PASSWORD'] ? { password: process.env['SUPER_ADMIN_PASSWORD'] } : {}),
  });
  console.log(r.created ? `super admin criado: ${r.email}` : `super admin já existe: ${r.email}`);
  if (r.generatedPassword) console.log(`senha provisória (mostrada uma única vez): ${r.generatedPassword}`);
} finally {
  await client.close();
}
