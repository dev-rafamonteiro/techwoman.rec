import type { Role, UserStatus } from '@tw/shared';
import { fail, type RuleError } from './types.js';

export interface StaffRef {
  id: string;
  roles: readonly Role[];
  status: UserStatus;
}

const isActiveSuper = (u: StaffRef) => u.status === 'active' && u.roles.includes('super_admin');

/**
 * Invariante (matriz de permissões): sempre existe ao menos um super admin ativo. Recusa a operação (desativar,
 * remover o papel, inclusive o próprio) que deixaria zero.
 */
export function checkSuperAdminInvariant(
  users: readonly StaffRef[],
  change: { userId: string; roles?: readonly Role[]; status?: UserStatus },
): { ok: true } | RuleError {
  const after = users.map((u) =>
    u.id === change.userId ? { ...u, roles: change.roles ?? u.roles, status: change.status ?? u.status } : u,
  );
  if (after.some(isActiveSuper)) return { ok: true };
  return fail('LAST_SUPER_ADMIN', 'Precisa existir ao menos um super admin ativo.');
}

/** Papel admin/super_admin só é concedido por super admin (E32 `alsoAdmin`, E43). */
export function canGrantAdminRole(actorRoles: readonly Role[]): boolean {
  return actorRoles.includes('super_admin');
}
