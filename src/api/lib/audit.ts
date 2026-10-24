import { ObjectId as ObjectIdCtor, type ClientSession, type ObjectId } from 'mongodb';
import type { FastifyRequest } from 'fastify';
import type { AuditLogDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { buildAuditEntry, type Actor } from '../domain/index.js';

export function actorOf(req: FastifyRequest): Actor {
  const u = req.auth?.user;
  if (!u) return { userId: null, role: 'system' };
  const role = u.roles.includes('super_admin') ? 'super_admin' : u.roles.includes('admin') ? 'admin' : 'mentor';
  return { userId: u._id.toHexString(), role };
}

/** Papel efetivo para uma rota: mentor em /mentor/*, admin/super_admin em /admin/*. */
export function actorForRoute(req: FastifyRequest, scope: 'mentor' | 'admin'): Actor {
  const u = req.auth?.user;
  if (!u) return { userId: null, role: 'system' };
  if (scope === 'mentor') return { userId: u._id.toHexString(), role: 'mentor' };
  return { userId: u._id.toHexString(), role: u.roles.includes('super_admin') ? 'super_admin' : 'admin' };
}

const toOid = (id: string | null): ObjectId | null => (id ? new ObjectIdCtor(id) : null);

/** RN17 · grava o registro de auditoria (na mesma transação quando recebe `session`). */
export async function writeAudit(
  ctx: AppContext,
  session: ClientSession | undefined,
  input: {
    actor: Actor;
    action: string;
    entity: string;
    entityId?: string | ObjectId | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  const e = buildAuditEntry({
    at: ctx.now(),
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ? String(input.entityId) : null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
  });
  const doc: AuditLogDoc = {
    _id: new ObjectIdCtor(),
    eventId: ctx.config.eventId,
    at: e.at,
    actorId: toOid(e.actorId),
    actorRole: e.actorRole,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    ip: e.ip,
  };
  await ctx.c.auditLogs.insertOne(doc, session ? { session } : {});
}
