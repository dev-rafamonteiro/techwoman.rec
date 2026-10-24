import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { MongoClient, Db } from 'mongodb';
import { API_PREFIX, SESSION_COOKIE } from '@tw/shared';
import { loadConfig, type Config } from './config.js';
import type { Notifier } from './worker/notifier.js';
import { makeContext, type AppContext } from './ctx.js';
import { AppError } from './lib/errors.js';
import { StreamHub } from './lib/stream-hub.js';
import { registerRoutes } from './routes/index.js';

export interface BuildAppOptions {
  /** Sobrescreve a configuração lida do ambiente (testes: { turnstileMode: 'test', rateLimitEnabled: false }). */
  config?: Partial<Config>;
  notifier?: Notifier;
  client: MongoClient;
  db: Db;
  /** false desliga o logger (testes). */
  logger?: boolean;
  /** Abre os Change Streams (SSE). Padrão: true. */
  streams?: boolean;
  now?: () => Date;
}

const stripQuery = (url: string) => url.split('?')[0] ?? url;

/** Chave de rate limit por sessão (cookie) ou, sem sessão, por IP. */
function rateKey(req: { ip: string; cookies?: Record<string, string | undefined> }): string {
  const jwt = req.cookies?.[SESSION_COOKIE];
  if (jwt) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sid?: string };
      if (payload.sid) return `s:${payload.sid}`;
    } catch {
      /* cai para o IP */
    }
  }
  return `ip:${req.ip}`;
}

export async function buildApp(opts: BuildAppOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const config: Config = { ...loadConfig(), ...opts.config };
  const app = Fastify({
    logger: opts.logger === false
      ? false
      : {
          level: process.env['LOG_LEVEL'] ?? 'info',
          // sem dados pessoais: nada de corpo, cookie ou token; URL sem query
          redact: { paths: ['req.headers.cookie', 'req.headers["x-mentee-token"]', 'req.headers.authorization', 'res.headers["set-cookie"]'], remove: true },
          serializers: {
            req: (req: { method: string; url: string; id: string }) => ({ method: req.method, url: stripQuery(req.url), requestId: req.id }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
        },
    genReqId: (req) => (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].length <= 64 ? req.headers['x-request-id'] : randomUUID()),
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  // JSON tolerante a corpo vazio (POST sem corpo, ex.: logout)
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError('VALIDATION_ERROR', 'JSON inválido.', { status: 400 }), undefined);
    }
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 } });
  await app.register(rateLimit, {
    global: config.rateLimitEnabled,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => rateKey(req as never),
    errorResponseBuilder: (_req, ctx) => new AppError('RATE_LIMITED', 'Muitas requisições. Aguarde um instante.', { headers: { 'Retry-After': String(Math.ceil(ctx.ttl / 1000)) } }),
  });

  const ctx = makeContext({ client: opts.client, db: opts.db, config, log: app.log, ...(opts.now ? { now: opts.now } : {}) });

  app.addHook('onRequest', async (req, reply) => {
    void reply.header('X-Request-Id', req.id);
    if (req.url.startsWith(API_PREFIX)) void reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).headers(err.headers ?? {}).send(err.toBody());
    }
    const e = err as { statusCode?: number; code?: string; message?: string; validation?: unknown };
    if (e.statusCode === 429) return reply.code(429).send({ code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde um instante.' });
    if (e.statusCode === 413 || e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ code: 'PAYLOAD_TOO_LARGE', message: 'O envio passa do tamanho permitido.' });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(422).send({ code: 'VALIDATION_ERROR', message: 'Requisição inválida.' });
    }
    req.log.error({ err }, 'erro não tratado');
    return reply.code(500).send({ code: 'INTERNAL', message: 'Erro interno. Tente novamente.' });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Rota não encontrada.' }));

  // saúde: /health (processo vivo) e /ready (ping no banco), também sob /api para o proxy
  for (const prefix of ['', API_PREFIX]) {
    app.get(`${prefix}/health`, async () => ({ ok: true }));
    app.get(`${prefix}/ready`, async (_req, reply) => {
      try {
        await opts.db.command({ ping: 1 });
        return { ok: true };
      } catch {
        return reply.code(503).send({ ok: false });
      }
    });
  }

  registerRoutes(app, ctx);

  if (opts.streams !== false) {
    ctx.hub = new StreamHub(ctx);
    ctx.hub.start();
    app.addHook('onClose', async () => {
      await ctx.hub?.stop();
    });
  }
  return { app, ctx };
}
