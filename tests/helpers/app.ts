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
  processOutbox?: (db: Db, opts: Record<string, unknown>) => Promise<{ sent: number; failed: number; skipped: number }>;
  MemoryNotifier?: new (...a: any[]) => { sent: any[] };
}

/** Carrega a API se já existir (src/api/app.ts); senão null e os testes de integração da API ficam `skip`. */
export async function loadApi(): Promise<ApiModules | null> {
  const appPath = "../../src/api/app.js";
  const workerPath = "../../src/api/worker/expire.js";
  const outboxPath = "../../src/api/worker/outbox.js";
  const notifierPath = "../../src/api/notifier.js";
  try {
    const app = await import(/* @vite-ignore */ appPath);
    const mods: ApiModules = { buildApp: app.buildApp };
    mods.expireInvites = (await import(/* @vite-ignore */ workerPath).catch(() => ({}))).expireInvites;
    mods.processOutbox = (await import(/* @vite-ignore */ outboxPath).catch(() => ({}))).processOutbox;
    mods.MemoryNotifier = (await import(/* @vite-ignore */ notifierPath).catch(() => ({}))).MemoryNotifier ?? app.MemoryNotifier;
    return typeof mods.buildApp === "function" ? mods : null;
  } catch {
    return null;
  }
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, any>;
}

/** Cliente HTTP em memória (app.inject) com cookie de sessão e headers de CSRF/idempotência. */
export class Client {
  cookie: string | undefined;
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
    const h: Record<string, string> = { ...headers };
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
