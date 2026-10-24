import { ObjectId, type Db } from 'mongodb';
import { getCollections } from './collections.js';
import { generateProvisionalPassword, hashPassword } from './password.js';

export interface SeedSuperAdminResult {
  created: boolean;
  email: string;
  /** Só presente quando a senha foi gerada aqui (mostrar uma única vez). */
  generatedPassword?: string;
}

/**
 * Cria o primeiro super admin (não existe rota pública para isso). Credenciais vêm de parâmetros/env
 * (SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, SUPER_ADMIN_PASSWORD). Sem senha, gera uma provisória.
 * Idempotente: se o e-mail já existe, garante o papel e não mexe na senha.
 */
export async function seedSuperAdmin(
  db: Db,
  input: { email: string; name: string; password?: string },
  now = new Date(),
): Promise<SeedSuperAdminResult> {
  const { users } = getCollections(db);
  const email = input.email.trim().toLowerCase();
  const existing = await users.findOne({ email });
  if (existing) {
    if (!existing.roles.includes('super_admin')) {
      await users.updateOne({ _id: existing._id }, { $addToSet: { roles: 'super_admin' }, $set: { status: 'active', updatedAt: now } });
    }
    return { created: false, email };
  }
  const password = input.password ?? generateProvisionalPassword();
  await users.insertOne({
    _id: new ObjectId(),
    name: input.name,
    email,
    roles: ['super_admin'],
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    status: 'active',
    linkedin: null,
    organization: null,
    areas: [],
    bio: null,
    photoUrl: null,
    availability: [],
    lastLoginAt: null,
    failedLogins: 0,
    failedLoginWindowStart: null,
    lockedUntil: null,
    passwordChangedAt: null,
    passwordResetCount: 0,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  });
  return { created: true, email, ...(input.password ? {} : { generatedPassword: password }) };
}
