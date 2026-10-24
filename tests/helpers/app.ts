import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { HEADERS, REQUESTED_WITH_VALUE, SESSION_COOKIE } from "@tw/shared";
import { hashPassword } from "../../src/db/password.js";

export const TEST_PASSWORD = "Senha-de-Teste-123";
let cachedHash: Promise<string> | undefined;
/** Um único hash argon2 reaproveitado por todas as contas de teste. */
export const testPasswordHash = () => (cachedHash ??= hashPassword(TEST_PASSWORD));

export interface ApiModules {
  buildApp: (opts: Record<string, unknown>) => Promise<FastifyInstance>;
  expireInvites?: (db: Db, client: MongoClient, now: Date) => Promise<{ expired: number }>;
  processOutbox?: (db: Db, opts: Record<string, unknown>) => Promise<{ sent: number; failed: number; skipped: number; retried: number }>;
  MemoryNotifier?: new (...a: any[]) => { sent: any[]; failNext(times?: number, permanent?: boolean): void };
}

/** Carrega a API (src/api/app.ts); se o import falhar os testes de integração da API ficam `skip`. */
export async function loadApi(): Promise<ApiModules | null> {
  const appPath = "../../src/api/app.js";
  const configPath = "../../src/api/config.js";
  const expirePath = "../../src/api/worker/expire.js";
  const outboxPath = "../../src/api/worker/outbox.js";
  const notifierPath = "../../src/api/worker/notifier.js";
  try {
    const app = await import(/* @vite-ignore */ appPath);
    const { loadConfig } = await import(/* @vite-ignore */ configPath);
    const mods: ApiModules = {
      // adapta { db, client, now, streams?, env? } para a assinatura real: buildApp({ config, client, db, logger, streams, now }) -> { app, ctx }
      // `env`: variáveis extras para o loadConfig (ex.: WHATSAPP_ENABLED, WAHA_WEBHOOK_HMAC_KEY nos testes de RN18)
      buildApp: async (o: Record<string, any>) => {
        const config = loadConfig({ NODE_ENV: "test", JWT_SECRET: "t".repeat(40), TURNSTILE_MODE: "test", EVENT_ID: o.eventId ?? "techwoman-2026", ...o.env } as NodeJS.ProcessEnv);
        const { app: fastify } = await app.buildApp({ config, client: o.client, db: o.db, logger: false, streams: o.streams ?? false, ...(o.searchOverrides ? { searchOverrides: o.searchOverrides } : {}), ...(o.now ? { now: o.now } : {}) });
        return fastify;
      },
    };
    const w = await import(/* @vite-ignore */ expirePath).catch(() => ({}));
    mods.expireInvites = w.expireInvites;
    mods.processOutbox = (await import(/* @vite-ignore */ outboxPath).catch(() => ({}))).processOutbox;
    mods.MemoryNotifier = (await import(/* @vite-ignore */ notifierPath).catch(() => ({}))).MemoryNotifier;
    return typeof app.buildApp === "function" ? mods : null;
  } catch (e) {
    if (process.env.TW_DEBUG_LOADAPI) console.error(e);
    return null;
  }
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, any>;
}

/** Cliente HTTP em memória (app.inject) com cookie de sessão e headers de CSRF/idempotência. */
let ipSeq = 1;
export class Client {
  cookie: string | undefined;
  /** IP simulado (X-Forwarded-For): cada cliente tem o seu, como no evento real com várias redes. */
  readonly ip = `10.${(ipSeq >> 8) & 255}.${ipSeq & 255}.${(ipSeq++ % 250) + 1}`;
  menteeToken: string | undefined;
  constructor(readonly app: FastifyInstance) {}

  static asMentee(app: FastifyInstance, token: string) {
    const c = new Client(app);
    c.menteeToken = token;
    return c;
  }

  async login(email: string, password = TEST_PASSWORD): Promise<Res> {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    const set = r.headers["set-cookie"];
    const raw = (Array.isArray(set) ? set : set ? [set] : []).find((c: string) => c.startsWith(`${SESSION_COOKIE}=`));
    if (raw) this.cookie = raw.split(";")[0];
    return r;
  }

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { "x-forwarded-for": this.ip, ...headers };
    if (method !== "GET") h[HEADERS.requestedWith] = REQUESTED_WITH_VALUE;
    if (this.cookie) h.cookie = this.cookie;
    if (this.menteeToken) h[HEADERS.menteeToken] = this.menteeToken;
    const res = await this.app.inject({ method: method as any, url, headers: h, ...(body !== undefined ? { payload: body as any } : {}) });
    let parsed: any = res.body;
    try {
      parsed = res.body ? JSON.parse(res.body) : null;
    } catch {
      /* corpo não JSON (csv, sse, png) */
    }
    return { status: res.statusCode, body: parsed, headers: res.headers };
  }
  get = (url: string, headers?: Record<string, string>) => this.req("GET", url, undefined, headers);
  post = (url: string, body?: unknown, headers?: Record<string, string>) => this.req("POST", url, body ?? {}, headers);
  patch = (url: string, body?: unknown, headers?: Record<string, string>) => this.req("PATCH", url, body, headers);
  put = (url: string, body?: unknown, headers?: Record<string, string>) => this.req("PUT", url, body, headers);
}
