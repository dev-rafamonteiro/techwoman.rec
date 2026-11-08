import type { FastifyInstance } from 'fastify';
import { E10, E11, E12, E13, type SessionUser } from '@tw/shared';
import { hashPassword, verifyPassword, type UserDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { clearSessionCookie, createSession, homePathFor, revokeSessions } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { respond, route } from '../lib/route.js';

const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 10 * 60_000;
const LOCK_MS = 5 * 60_000;

let dummyHash: Promise<string> | null = null;

export function toSessionUser(u: UserDoc): SessionUser {
  return {
    id: u._id.toHexString(),
    name: u.name,
    email: u.email,
    roles: u.roles,
    mustChangePassword: u.mustChangePassword,
    homePath: homePathFor(u),
    linkedin: u.linkedin,
    phone: u.phone ?? null,
    photoUrl: u.photoUrl,
    areas: u.areas,
    themes: u.themes ?? [],
    bio: u.bio,
  };
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E10 · POST /auth/login · bloqueio de 5 min após 5 falhas em 10 min
  route(
    app,
    ctx,
    E10,
    async ({ req, reply, body }) => {
      const now = ctx.now();
      const user = await ctx.c.users.findOne({ email: body.email });
      if (!user) {
        // iguala o tempo de resposta para não revelar se o e-mail existe
        dummyHash ??= hashPassword('dummy-password-for-timing');
        await verifyPassword(await dummyHash, body.password);
        throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
      }
      if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
        throw new AppError('ACCOUNT_LOCKED', 'Muitas tentativas. Tente de novo em alguns minutos.', { details: { until: user.lockedUntil.toISOString() } });
      }
      const ok = await verifyPassword(user.passwordHash, body.password);
      if (!ok) {
        const windowStart = new Date(now.getTime() - FAIL_WINDOW_MS);
        const after = await ctx.c.users.findOneAndUpdate(
          { _id: user._id },
          [
            { $set: { _fresh: { $or: [{ $eq: ['$failedLoginWindowStart', null] }, { $lt: ['$failedLoginWindowStart', windowStart] }] } } },
            {
              $set: {
                failedLogins: { $cond: ['$_fresh', 1, { $add: ['$failedLogins', 1] }] },
                failedLoginWindowStart: { $cond: ['$_fresh', now, '$failedLoginWindowStart'] },
              },
            },
            { $set: { lockedUntil: { $cond: [{ $gte: ['$failedLogins', MAX_FAILS] }, new Date(now.getTime() + LOCK_MS), '$lockedUntil'] } } },
            { $unset: '_fresh' },
          ],
          { returnDocument: 'after' },
        );
        if (after?.lockedUntil && after.lockedUntil.getTime() > now.getTime()) {
          await ctx.c.users.updateOne({ _id: user._id }, { $set: { failedLogins: 0, failedLoginWindowStart: null } });
          throw new AppError('ACCOUNT_LOCKED', 'Muitas tentativas. Tente de novo em alguns minutos.', { details: { until: after.lockedUntil.toISOString() } });
        }
        throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
      }
      if (user.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Esta conta está desativada. Procure a organização.');
      if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() <= now.getTime()) {
        throw new AppError('TEMP_PASSWORD_EXPIRED', 'A senha provisória venceu. Peça uma nova senha a quem administra o evento.');
      }
      const updated = await ctx.c.users.findOneAndUpdate(
        { _id: user._id },
        { $set: { lastLoginAt: now, failedLogins: 0, failedLoginWindowStart: null, lockedUntil: null, updatedAt: now } },
        { returnDocument: 'after' },
      );
      const u = updated ?? user;
      await createSession(ctx, req, reply, u);
      await writeAudit(ctx, undefined, { actor: { userId: u._id.toHexString(), role: u.roles.includes('super_admin') ? 'super_admin' : u.roles.includes('admin') ? 'admin' : 'mentor' }, action: 'auth.login', entity: 'user', entityId: u._id, ip: req.ip });
      return { user: toSessionUser(u) };
    },
    { rateLimit: { max: 300, timeWindow: '10 minutes' } },
  );

  // E11 · POST /auth/logout
  route(app, ctx, E11, async ({ req, reply }) => {
    if (req.auth) await ctx.c.sessions.deleteOne({ _id: req.auth.sid });
    clearSessionCookie(ctx, reply);
    return { ok: true as const };
  });

  // E12 · GET /auth/me
  route(app, ctx, E12, async ({ user }) => ({ user: toSessionUser(user) }));

  // E13 · POST /auth/change-password · revoga as demais sessões
  route(app, ctx, E13, async ({ req, user, body }) => {
    const ok = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Senha atual incorreta.', { status: 422 });
    if (body.newPassword === body.currentPassword) throw new AppError('WEAK_PASSWORD', 'A nova senha precisa ser diferente da atual.');
    const now = ctx.now();
    await ctx.c.users.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, passwordChangedAt: now, tempPasswordExpiresAt: null, updatedAt: now } },
    );
    await revokeSessions(ctx, user._id, req.auth?.sid);
    await writeAudit(ctx, undefined, { actor: { userId: user._id.toHexString(), role: user.roles.includes('super_admin') ? 'super_admin' : user.roles.includes('admin') ? 'admin' : 'mentor' }, action: 'auth.change_password', entity: 'user', entityId: user._id, ip: req.ip });
    return respond(200, { ok: true as const });
  });
}
