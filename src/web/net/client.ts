import type { z } from 'zod';
import {
  API_PREFIX,
  HEADERS,
  REQUESTED_WITH_VALUE,
  buildPath,
  type EndpointDef,
  type ErrorCode,
} from '@tw/shared';

// Tipos de entrada/saída por endpoint. `response?`/`body?` no EndpointDef acrescentam undefined; NonNullable resolve.
type Infer<T, Mode extends 'in' | 'out'> = NonNullable<T> extends z.ZodType ? (Mode extends 'in' ? z.input<NonNullable<T>> : z.output<NonNullable<T>>) : undefined;
export type ParamsOf<E extends EndpointDef> = Infer<E['params'], 'out'>;
export type QueryOf<E extends EndpointDef> = Infer<E['query'], 'in'>;
export type BodyOf<E extends EndpointDef> = Infer<E['body'], 'in'>;
export type ResponseOf<E extends EndpointDef> = Infer<E['response'], 'out'>;

/** Erro padrão da API: { code, message }. `status` é o HTTP; 0 = sem rede. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

// --- Token da participante (link pessoal) -----------------------------------
const MENTEE_TOKEN_KEY = 'tw.menteeToken';
let menteeTokenMemory: string | null = null;

export function setMenteeToken(token: string | null): void {
  menteeTokenMemory = token;
  try {
    if (token) sessionStorage.setItem(MENTEE_TOKEN_KEY, token);
    else sessionStorage.removeItem(MENTEE_TOKEN_KEY);
  } catch {
    /* modo privado: fica só em memória */
  }
}
export function getMenteeToken(): string | null {
  if (menteeTokenMemory) return menteeTokenMemory;
  try {
    return sessionStorage.getItem(MENTEE_TOKEN_KEY);
  } catch {
    return null;
  }
}

// --- Sessão expirada --------------------------------------------------------
type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
/** O AuthProvider assina para levar o usuário a M1 mantendo a rota de retorno. */
export function onSessionExpired(fn: Listener): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

type Listener2 = () => void;
const passwordChangeListeners = new Set<Listener2>();
/** 403 PASSWORD_CHANGE_REQUIRED em qualquer chamada autenticada: o AuthProvider leva a M2 (/entrar/nova-senha). */
export function onPasswordChangeRequired(fn: Listener2): () => void {
  passwordChangeListeners.add(fn);
  return () => passwordChangeListeners.delete(fn);
}

// --- Chamada tipada ---------------------------------------------------------
export interface CallOptions<E extends EndpointDef> {
  params?: ParamsOf<E>;
  query?: QueryOf<E>;
  body?: BodyOf<E>;
  /** Sobrescreve o token da participante (padrão: o guardado por setMenteeToken). */
  menteeToken?: string;
  /** Idempotency-Key explícita; para endpoints idempotentes é gerada sozinha. */
  idempotencyKey?: string;
  /** Corpo multipart (E33, upload de CSV). Usado por callForm; o Content-Type com boundary fica por conta do navegador. */
  form?: FormData;
  /** Não dispara o redirecionamento de sessão expirada em 401 (probe inicial de E12: 401 ali só significa "sem sessão"). */
  silentAuth?: boolean;
  /** Token do Turnstile (E02). */
  turnstileToken?: string;
  signal?: AbortSignal;
}

function queryString(query: unknown): string {
  if (!query || typeof query !== 'object') return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function send<E extends EndpointDef>(ep: E, opts: CallOptions<E>): Promise<Response> {
  const headers: Record<string, string> = { Accept: ep.contentType ?? 'application/json' };
  if (ep.method !== 'GET') headers[HEADERS.requestedWith] = REQUESTED_WITH_VALUE;
  if (ep.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';
  if (ep.auth === 'mentee') {
    const t = opts.menteeToken ?? getMenteeToken();
    if (t) headers[HEADERS.menteeToken] = t;
  }
  if (ep.idempotent) headers[HEADERS.idempotencyKey] = opts.idempotencyKey ?? newIdempotencyKey();
  if (opts.turnstileToken) headers[HEADERS.turnstile] = opts.turnstileToken;

  const url = API_PREFIX + buildPath(ep.path, opts.params as Record<string, string | number> | undefined) + queryString(opts.query);
  let res: Response;
  try {
    res = await fetch(url, {
      method: ep.method,
      headers,
      credentials: 'include',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Sem conexão. Confira a internet e tente de novo.');
  }
  if (!res.ok) {
    let code: ErrorCode = 'INTERNAL';
    let message = 'Algo deu errado. Tente de novo.';
    let details: unknown;
    try {
      const j = (await res.json()) as { code?: ErrorCode; message?: string; details?: unknown };
      if (j.code) code = j.code;
      if (j.message) message = j.message;
      details = j.details;
    } catch {
      /* corpo não-JSON */
    }
    const err = new ApiError(res.status, code, message, details);
    if (ep.auth === 'staff' && err.code === 'UNAUTHENTICATED' && !opts.silentAuth) sessionExpiredListeners.forEach((fn) => fn());
    if (ep.auth === 'staff' && err.code === 'PASSWORD_CHANGE_REQUIRED') passwordChangeListeners.forEach((fn) => fn());
    throw err;
  }
  return res;
}

/** Chama um endpoint de ENDPOINTS (de @tw/shared) e devolve o JSON tipado. */
export async function call<E extends EndpointDef>(ep: E, opts: CallOptions<E> = {}): Promise<ResponseOf<E>> {
  const res = await send(ep, opts);
  if (res.status === 204) return undefined as ResponseOf<E>;
  return (await res.json()) as ResponseOf<E>;
}

/** Envio multipart (E33: campo `file`). Devolve o JSON tipado. */
export async function callForm<E extends EndpointDef>(ep: E, opts: CallOptions<E> & { form: FormData }): Promise<ResponseOf<E>> {
  return call(ep, opts);
}

/** Para respostas que não são JSON (CSV de E37, PNG/SVG de E42, CSV de senhas de E33). */
export async function callBlob<E extends EndpointDef>(ep: E, opts: CallOptions<E> = {}): Promise<Blob> {
  return (await send(ep, opts)).blob();
}

/** Baixa um Blob como arquivo. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL pública de um endpoint (ex.: <img src> do QR Code de E42). */
export function endpointUrl<E extends EndpointDef>(ep: E, opts: Pick<CallOptions<E>, 'params' | 'query'> = {}): string {
  return API_PREFIX + buildPath(ep.path, opts.params as Record<string, string | number> | undefined) + queryString(opts.query);
}
