import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { API_PREFIX, HEADERS, type EndpointDef } from '@tw/shared';
import type { MenteeDoc, UserDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { authenticate, hasAnyRole } from './auth.js';
import { checkCsrf } from './csrf.js';
import { AppError } from './errors.js';
import { requestHash, withIdempotency, type IdemHandle } from './idempotency.js';
import { findMenteeByToken } from './mentee-auth.js';

type Present<T> = Exclude<T, undefined>;
type Out<T> = [Present<T>] extends [never] ? undefined : Present<T> extends z.ZodType ? z.output<Present<T>> : undefined;

/** Resposta com status/headers explícitos (201, 202...). */
export class Respond<T> {
  constructor(
    readonly status: number,
    readonly body: T,
    readonly headers: Record<string, string> = {},
  ) {}
}
export const respond = <T>(status: number, body: T, headers?: Record<string, string>) => new Respond(status, body, headers);

/** O handler já enviou a resposta (SSE, CSV, PNG). */
export const RAW = Symbol('raw-reply');

export interface HandlerArgs<E extends EndpointDef> {
  req: FastifyRequest;
  reply: FastifyReply;
  ctx: AppContext;
  params: Out<E['params']>;
  query: Out<E['query']>;
  body: Out<E['body']>;
  /** Usuário de staff autenticado (rotas `auth: 'staff'`). */
  user: UserDoc;
  /** Participante autenticada pelo token (rotas `auth: 'mentee'`). */
  mentee: MenteeDoc;
  /** Presente quando a rota é idempotente e o cliente mandou Idempotency-Key. */
  idem: IdemHandle | undefined;
}

export type HandlerResult<E extends EndpointDef> = Out<E['response']> | Respond<Out<E['response']>> | typeof RAW | void;

export interface RouteOptions {
  rateLimit?: { max: number; timeWindow: string | number };
  /** Rotas que o usuário com `mustChangePassword` ainda pode chamar (E11, E12, E13, E28). */
  allowWhilePasswordChange?: boolean;
  /** Corpo bruto (multipart): não faz parse do `body`. */
  rawBody?: boolean;
}

const PASSWORD_CHANGE_OK = new Set(['E11', 'E12', 'E13', 'E28']);

function parseWith(schema: z.ZodType | undefined, data: unknown, where: string): unknown {
  if (!schema) return undefined;
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new AppError('VALIDATION_ERROR', `Dados inválidos (${where}).`, {
      details: { issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  return r.data;
}

export function route<E extends EndpointDef>(
  app: FastifyInstance,
  ctx: AppContext,
  e: E,
  handler: (a: HandlerArgs<E>) => Promise<HandlerResult<E>>,
  opts: RouteOptions = {},
): void {
  const isWrite = e.method !== 'GET';
  app.route({
    method: e.method,
    url: API_PREFIX + e.path,
    config: opts.rateLimit && ctx.config.rateLimitEnabled ? { rateLimit: opts.rateLimit } : {},
    handler: async (req, reply) => {
      let user: UserDoc | undefined;
      let mentee: MenteeDoc | undefined;
      if (e.auth === 'staff') {
        if (isWrite) checkCsrf(req, ctx.config);
        const auth = await authenticate(ctx, req, reply);
        req.auth = auth;
        user = auth.user;
        if (!hasAnyRole(user, e.roles)) throw new AppError('FORBIDDEN', 'Você não tem acesso a esta área.');
        if (user.mustChangePassword && !PASSWORD_CHANGE_OK.has(e.code) && !opts.allowWhilePasswordChange) {
          throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Troque a senha provisória para continuar.');
        }
      } else if (e.auth === 'mentee') {
        const raw = req.headers[HEADERS.menteeToken.toLowerCase()];
        mentee = await findMenteeByToken(ctx, Array.isArray(raw) ? raw[0] : raw);
      } else if (isWrite && e.code !== 'E02' && e.code !== 'E05') {
        // E10 (login) é público mas usa cookie: exige o header anti-CSRF
        checkCsrf(req, ctx.config);
      }

      const params = parseWith(e.params, req.params, 'rota') as Out<E['params']>;
      const query = parseWith(e.query, req.query, 'query') as Out<E['query']>;
      const body = (opts.rawBody ? undefined : parseWith(e.body, req.body, 'corpo')) as Out<E['body']>;

      const run = async (idem: IdemHandle | undefined) => {
        const out = await handler({ req, reply, ctx, params, query, body, user: user as UserDoc, mentee: mentee as MenteeDoc, idem });
        if (out === RAW) return RAW;
        const res = out instanceof Respond ? out : new Respond(200, out ?? null);
        if (ctx.config.validateResponses && e.response && res.status < 300) {
          const v = (e.response as z.ZodType).safeParse(res.body);
          if (!v.success) {
            ctx.log.error({ code: e.code, issues: v.error.issues.slice(0, 5) }, 'resposta fora do contrato');
            throw new AppError('INTERNAL', `Resposta de ${e.code} fora do contrato: ${JSON.stringify(v.error.issues.slice(0, 3))}`);
          }
        }
        return res;
      };

      const keyHeader = req.headers[HEADERS.idempotencyKey.toLowerCase()];
      const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
      if (e.idempotent && key) {
        if (key.length > 128) throw new AppError('VALIDATION_ERROR', 'Idempotency-Key longa demais.');
        const principal = user ? `u:${user._id}` : `m:${mentee?._id}`;
        const done = await withIdempotency(
          ctx,
          { principal, route: `${e.code}:${e.method}:${JSON.stringify(params ?? {})}`, key, hash: requestHash(e.code, params, body) },
          async (idem) => {
            const res = await run(idem);
            if (res === RAW) throw new AppError('INTERNAL', 'Rota idempotente não pode responder em modo bruto.');
            return { status: res.status, body: res.body };
          },
        );
        return reply
          .code(done.status)
          .headers(done.replay ? { 'Idempotent-Replay': 'true' } : {})
          .send(done.body);
      }

      const res = await run(undefined);
      if (res === RAW) return reply;
      return reply.code(res.status).headers(res.headers).send(res.body);
    },
  });
}
