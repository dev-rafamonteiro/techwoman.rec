import type { OutboxChannel, OutboxType } from '@tw/shared';
import { createTransport, type Transporter } from 'nodemailer';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { maskEmail } from '../lib/log.js';

/** Anexo de e-mail (ex.: `.ics` do e-mail de confirmação). */
export interface NotifierAttachment {
  filename: string;
  contentType: string;
  /** Conteúdo em texto (UTF-8). */
  content: string;
}

export interface NotifierMessage {
  channel: OutboxChannel;
  to: string;
  type: OutboxType;
  /** Versão em texto do e-mail. */
  text: string;
  subject: string;
  /** Corpo HTML (o `text` segue como alternativa). */
  html?: string;
  attachments?: NotifierAttachment[];
  /** dedupeKey: o provedor deve tratá-la como chave de idempotência (mitiga duplicata em crash). */
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/** Falha de envio. `permanent` (ex.: destinatário inválido) não é repetida. */
export class NotifierError extends Error {
  constructor(message: string, readonly permanent = false) {
    super(message);
  }
}

/**
 * Limite do provedor (HTTP 429, throttling do SES): não é falha da mensagem. O worker devolve o item à fila sem gastar
 * tentativa e pausa o canal por `retryAfterMs`.
 */
/** Espera padrão quando o provedor não diz quanto esperar; cota diária/mensal estourada espera mais. */
export const RATE_LIMIT_WAIT_MS = 1_000;
export const QUOTA_WAIT_MS = 5 * 60_000;

export class RateLimitError extends NotifierError {
  /** Teto de 5 min: um cabeçalho estranho (data distante, epoch) não pode estacionar a mensagem fora do alerta da fila. */
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message, false);
    this.retryAfterMs = Math.min(Math.max(0, Number.isFinite(retryAfterMs) ? retryAfterMs : RATE_LIMIT_WAIT_MS), QUOTA_WAIT_MS);
  }
}

/** `Retry-After` em segundos (ou data HTTP); senão `ratelimit-reset` (segundos, Resend). */
export function retryAfterMs(headers: Headers, now = Date.now()): number | null {
  const ra = headers.get('retry-after');
  if (ra) {
    const sec = Number(ra);
    if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
    const at = Date.parse(ra);
    if (!Number.isNaN(at)) return Math.max(0, at - now);
  }
  const reset = Number(headers.get('ratelimit-reset'));
  return Number.isFinite(reset) && headers.get('ratelimit-reset') !== null ? Math.max(0, reset * 1000) : null;
}

/** Resultado do envio. `providerMessageId`: id da mensagem no provedor, quando ele devolve. */
export interface NotifierResult {
  providerMessageId?: string;
}

export interface Notifier {
  send(msg: NotifierMessage): Promise<NotifierResult | void>;
}

/** Notifier de teste: guarda o que foi enviado e permite simular falhas. */
export class MemoryNotifier implements Notifier {
  readonly sent: NotifierMessage[] = [];
  private failures: { left: number; permanent: boolean; rateLimitMs?: number }[] = [];
  /** Falha nos próximos `times` envios. */
  failNext(times = 1, permanent = false): void {
    this.failures.push({ left: times, permanent });
  }
  /** Responde "limite do provedor" (429) nos próximos `times` envios. */
  rateLimitNext(times = 1, retryAfterMs = 1_000): void {
    this.failures.push({ left: times, permanent: false, rateLimitMs: retryAfterMs });
  }
  async send(msg: NotifierMessage): Promise<NotifierResult> {
    const f = this.failures[0];
    if (f) {
      if (--f.left <= 0) this.failures.shift();
      if (f.rateLimitMs !== undefined) throw new RateLimitError('HTTP 429 limite simulado', f.rateLimitMs);
      throw new NotifierError('falha simulada', f.permanent);
    }
    this.sent.push(msg);
    return { providerMessageId: `MEM${this.sent.length}` };
  }
}

/** Dev: só registra (destino mascarado, sem texto). */
export class ConsoleNotifier implements Notifier {
  constructor(private readonly log: (o: object, m: string) => void) {}
  async send(msg: NotifierMessage): Promise<void> {
    this.log({ channel: msg.channel, type: msg.type, to: maskEmail(msg.to) }, 'notificação (console)');
  }
}

/** Padrão: 4xx é permanente, menos 408 e 429; rede e 5xx tentam de novo. */
const defaultPermanent = (status: number) => status >= 400 && status < 500 && status !== 429 && status !== 408;

/** POST JSON; devolve o corpo da resposta (ou undefined se não for JSON). */
async function postJson(url: string, headers: Record<string, string>, body: unknown, isPermanent = defaultPermanent): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new NotifierError(`rede: ${(err as Error).message}`);
  }
  if (res.ok) return res.json().catch(() => undefined);
  const text = (await res.text().catch(() => '')).slice(0, 200);
  if (res.status === 429) {
    // Resend: `daily_quota_exceeded` / `monthly_quota_exceeded` não passam em 1 s; espera mais para não martelar
    const quota = /quota/i.test(text);
    throw new RateLimitError(`HTTP 429 ${text}`, retryAfterMs(res.headers) ?? (quota ? QUOTA_WAIT_MS : RATE_LIMIT_WAIT_MS));
  }
  throw new NotifierError(`HTTP ${res.status} ${text}`, isPermanent(res.status));
}

/** Remetente padrão (PLAN, "Layouts de e-mail"). */
export const DEFAULT_EMAIL_FROM = 'Tech Woman <mentoria@techwoman.dev>';

/** E-mail transacional via Resend (EMAIL_TRANSPORT=resend). */
export class ResendEmailNotifier implements Notifier {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly replyTo?: string) {}
  async send(msg: NotifierMessage): Promise<void> {
    await postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${this.apiKey}`, 'Idempotency-Key': msg.idempotencyKey },
      {
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        ...(msg.attachments?.length
          ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'utf8').toString('base64'), content_type: a.contentType })) }
          : {}),
      },
    );
  }
}

/** E-mail por nodemailer: SMTP (dev: Mailpit) ou Amazon SES (EMAIL_TRANSPORT=smtp | ses). */
export class MailerEmailNotifier implements Notifier {
  constructor(private readonly transport: Transporter, private readonly from: string, private readonly replyTo?: string) {}
  async send(msg: NotifierMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        messageId: `<${msg.idempotencyKey.replace(/[^A-Za-z0-9._:-]/g, '_')}@techwoman.dev>`,
        ...(msg.attachments?.length
          ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) }
          : {}),
      });
    } catch (err) {
      const e = err as { responseCode?: number; code?: string; name?: string; message?: string };
      // SES "Maximum sending rate exceeded" (Throttling) e SMTP 421/454: limite do servidor, não da mensagem
      if (e.name === 'ThrottlingException' || e.code === 'Throttling' || e.responseCode === 421 || e.responseCode === 454 || /rate exceeded|throttl/i.test(e.message ?? '')) {
        throw new RateLimitError(`e-mail: ${(e.message ?? String(err)).slice(0, 200)}`, RATE_LIMIT_WAIT_MS);
      }
      // resposta 5xx do servidor SMTP: destinatário ou mensagem recusados, não adianta repetir
      const permanent = typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600;
      throw new NotifierError(`e-mail: ${(e.message ?? String(err)).slice(0, 200)}`, permanent);
    }
  }
}

/** Roteia por canal (só e-mail). Canal sem provedor configurado falha de forma permanente (vira `skipped` no worker). */
export class RoutingNotifier implements Notifier {
  constructor(private readonly byChannel: Partial<Record<OutboxChannel, Notifier>>) {}
  async send(msg: NotifierMessage): Promise<NotifierResult | void> {
    const n = this.byChannel[msg.channel];
    if (!n) throw new NotifierError(`canal ${msg.channel} desligado`, true);
    return n.send(msg);
  }
}

export type EmailTransport = 'smtp' | 'ses' | 'resend' | 'console';

/**
 * EMAIL_TRANSPORT=smtp | ses | resend. `EMAIL_PROVIDER` é alias antigo (resend | console).
 * Sem nenhum dos dois: smtp se houver SMTP_HOST; senão console (só fora de produção).
 */
export function emailTransportFromEnv(env: NodeJS.ProcessEnv): EmailTransport {
  const raw = (env['EMAIL_TRANSPORT'] || env['EMAIL_PROVIDER'] || '').toLowerCase();
  if (raw === 'smtp' || raw === 'ses' || raw === 'resend' || raw === 'console') return raw;
  if (raw) throw new Error(`EMAIL_TRANSPORT inválido: "${raw}" (use smtp, ses ou resend)`);
  if (env['SMTP_HOST']) return 'smtp';
  if (env['NODE_ENV'] === 'production') throw new Error('EMAIL_TRANSPORT é obrigatório em produção (smtp, ses ou resend)');
  return 'console';
}

function emailNotifier(env: NodeJS.ProcessEnv, readSecret: (n: string) => string | undefined, log: (o: object, m: string) => void): Notifier {
  const transport = emailTransportFromEnv(env);
  const from = env['EMAIL_FROM'] || DEFAULT_EMAIL_FROM;
  const replyTo = env['EMAIL_REPLY_TO'] || undefined;
  switch (transport) {
    case 'resend': {
      const key = readSecret('EMAIL_API_KEY');
      if (!key) throw new Error('EMAIL_API_KEY (ou EMAIL_API_KEY_FILE) é obrigatório com EMAIL_TRANSPORT=resend');
      return new ResendEmailNotifier(key, from, replyTo);
    }
    case 'smtp': {
      const host = env['SMTP_HOST'];
      if (!host) throw new Error('SMTP_HOST é obrigatório com EMAIL_TRANSPORT=smtp');
      const user = env['SMTP_USER'];
      const pass = readSecret('SMTP_PASS');
      if (user && !pass) throw new Error('SMTP_PASS (ou SMTP_PASS_FILE) é obrigatório com SMTP_USER');
      const secure = ['1', 'true', 'yes'].includes((env['SMTP_SECURE'] || '').toLowerCase());
      return new MailerEmailNotifier(createTransport({ host, port: Number(env['SMTP_PORT'] || (secure ? 465 : 25)), secure, ...(user ? { auth: { user, pass: pass! } } : {}) }), from, replyTo);
    }
    case 'ses':
      // região em AWS_REGION; as credenciais vêm da cadeia padrão da AWS (variáveis, perfil ou role)
      return new MailerEmailNotifier(createTransport({ SES: { sesClient: new SESv2Client(env['AWS_REGION'] ? { region: env['AWS_REGION'] } : {}), SendEmailCommand } }), from, replyTo);
    default:
      return new ConsoleNotifier(log);
  }
}

export function notifierFromEnv(env: NodeJS.ProcessEnv, readSecret: (n: string) => string | undefined, log: (o: object, m: string) => void): Notifier {
  return new RoutingNotifier({ email: emailNotifier(env, readSecret, log) });
}
