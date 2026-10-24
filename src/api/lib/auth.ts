import { ObjectId } from 'mongodb';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, type Role } from '@tw/shared';
import type { UserDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { AppError } from './errors.js';
import { newSessionId } from './tokens.js';

export interface AuthInfo {
  user: UserDoc;
  sid: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthInfo;
  }
}

const JWT_TTL_SECONDS = 15 * 60;
const JWT_REISSUE_AFTER_SECONDS = 5 * 60;

const keyOf = (secret: string) => new TextEncoder().encode(secret);

async function signJwt(ctx: AppContext, sid: string, userId: ObjectId): Promise<string> {
  const nowSec = Math.floor(ctx.now().getTime() / 1000);
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId.toHexString())
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + JWT_TTL_SECONDS)
    .sign(keyOf(ctx.config.jwtSecret));
}

function setCookie(ctx: AppContext, reply: FastifyReply, jwt: string, maxAgeSeconds: number): void {
  void reply.setCookie(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: ctx.config.cookieSecure, sameSite: 'lax' });
}

/** Cria a sessão no banco (revogável) e grava o cookie `sid` com o JWT de 15 min. */
export async function createSession(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, user: UserDoc): Promise<string> {
  const now = ctx.now();
  const sid = newSessionId();
  const ttlMs = ctx.config.sessionHours * 3600_000;
  await ctx.c.sessions.insertOne({
    _id: sid,
    userId: user._id,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
    revokedAt: null,
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 200) || null,
  });
  setCookie(ctx, reply, await signJwt(ctx, sid, user._id), Math.floor(ttlMs / 1000));
  return sid;
}

/** Revoga sessões do usuário (desativar, trocar/redefinir senha). `exceptSid` mantém a atual. */
export async function revokeSessions(ctx: AppContext, userId: ObjectId, exceptSid?: string): Promise<void> {
  await ctx.c.sessions.deleteMany({ userId, ...(exceptSid ? { _id: { $ne: exceptSid } } : {}) });
}

/**
 * Autentica pelo cookie: JWT assinado (renovado em silêncio quando expira) + sessão viva no banco. A consulta ao
 * banco a cada requisição dá revogação imediata (desativar mentora).
 */
export async function authenticate(ctx: AppContext, req: FastifyRequest, reply: FastifyReply): Promise<AuthInfo> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw new AppError('UNAUTHENTICATED', 'Faça login para continuar.');
  const now = ctx.now();
  let sid: string;
  let sub: string;
  let iat: number;
  let expired = false;
  try {
    const { payload } = await jwtVerify(token, keyOf(ctx.config.jwtSecret), { algorithms: ['HS256'], currentDate: now });
    sid = String(payload['sid']);
    sub = String(payload.sub);
    iat = payload.iat ?? 0;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      const p = err.payload;
      sid = String(p['sid']);
      sub = String(p.sub);
      iat = p.iat ?? 0;
      expired = true;
    } else {
      clearSessionCookie(ctx, reply);
      throw new AppError('UNAUTHENTICATED', 'Sessão inválida.');
    }
  }
  if (!ObjectId.isValid(sub)) throw new AppError('UNAUTHENTICATED', 'Sessão inválida.');
  const session = await ctx.c.sessions.findOne({ _id: sid, revokedAt: null, expiresAt: { $gt: now } });
  if (!session || session.userId.toHexString() !== sub) {
    clearSessionCookie(ctx, reply);
    throw new AppError('UNAUTHENTICATED', 'Sessão expirada.');
  }
  const user = await ctx.c.users.findOne({ _id: session.userId });
  if (!user || user.status !== 'active') {
    await ctx.c.sessions.deleteOne({ _id: sid });
    clearSessionCookie(ctx, reply);
    throw new AppError('UNAUTHENTICATED', 'Sessão expirada.');
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  if (expired || nowSec - iat > JWT_REISSUE_AFTER_SECONDS) {
    setCookie(ctx, reply, await signJwt(ctx, sid, user._id), Math.max(1, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)));
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    void ctx.c.sessions.updateOne({ _id: sid }, { $set: { lastSeenAt: now } }).catch(() => undefined);
  }
  return { user, sid };
}

export function hasAnyRole(user: UserDoc, roles: readonly Role[] | undefined): boolean {
  if (!roles || roles.length === 0) return true;
  return roles.some((r) => user.roles.includes(r));
}

export const isAdmin = (user: UserDoc) => user.roles.includes('admin') || user.roles.includes('super_admin');

/** Pagina inicial por perfil (redirecionamento pós-login, M1). */
export function homePathFor(user: Pick<UserDoc, 'roles'>): string {
  if (user.roles.includes('admin') || user.roles.includes('super_admin')) return '/admin';
  return '/mentora/aguardando';
}
