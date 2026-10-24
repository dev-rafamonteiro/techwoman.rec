import type { Actor } from './types.js';

export interface AuditEntry {
  at: Date;
  actorId: string | null;
  actorRole: Actor['role'];
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
}

/** RN17 · Toda escrita feita por staff e toda mudança de status gera um registro em `audit_logs`. */
export function buildAuditEntry(input: {
  at: Date;
  actor: Actor;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): AuditEntry {
  return {
    at: input.at,
    actorId: input.actor.userId,
    actorRole: input.actor.role,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
  };
}
