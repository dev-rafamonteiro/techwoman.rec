import type { OutboxChannel, OutboxType } from '@tw/shared';
import { maskEmail } from '../lib/log.js';

export interface NotifierMessage {
  channel: OutboxChannel;
  to: string;
  type: OutboxType;
  /** Texto final já renderizado a partir dos modelos de A7. */
  text: string;
  subject: string;
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

export interface Notifier {
  send(msg: NotifierMessage): Promise<void>;
}

/** Notifier de teste: guarda o que foi enviado e permite simular falhas. */
export class MemoryNotifier implements Notifier {
  readonly sent: NotifierMessage[] = [];
  private failures: { left: number; permanent: boolean }[] = [];
  /** Falha nos próximos `times` envios. */
  failNext(times = 1, permanent = false): void {
    this.failures.push({ left: times, permanent });
  }
  async send(msg: NotifierMessage): Promise<void> {
    const f = this.failures[0];
    if (f) {
      if (--f.left <= 0) this.failures.shift();
      throw new NotifierError('falha simulada', f.permanent);
    }
    this.sent.push(msg);
  }
}

/** Dev: só registra (destino mascarado, sem texto). */
export class ConsoleNotifier implements Notifier {
  constructor(private readonly log: (o: object, m: string) => void) {}
  async send(msg: NotifierMessage): Promise<void> {
    this.log({ channel: msg.channel, type: msg.type, to: msg.channel === 'email' ? maskEmail(msg.to) : '***' }, 'notificação (console)');
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new NotifierError(`rede: ${(err as Error).message}`);
  }
  if (res.ok) return;
  const text = (await res.text().catch(() => '')).slice(0, 200);
  throw new NotifierError(`HTTP ${res.status} ${text}`, res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408);
}

/** E-mail transacional via Resend (interface trocável por EMAIL_PROVIDER). */
export class ResendEmailNotifier implements Notifier {
  constructor(private readonly apiKey: string, private readonly from: string) {}
  send(msg: NotifierMessage): Promise<void> {
    return postJson('https://api.resend.com/emails', { Authorization: `Bearer ${this.apiKey}`, 'Idempotency-Key': msg.idempotencyKey }, { from: this.from, to: [msg.to], subject: msg.subject, text: msg.text });
  }
}

/** WhatsApp Business Cloud API (texto; em produção exige modelos aprovados). */
export class WhatsAppCloudNotifier implements Notifier {
  constructor(private readonly token: string, private readonly phoneNumberId: string) {}
  send(msg: NotifierMessage): Promise<void> {
    return postJson(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, { Authorization: `Bearer ${this.token}` }, { messaging_product: 'whatsapp', to: msg.to.replace(/^\+/, ''), type: 'text', text: { body: msg.text } });
  }
}

/** Roteia por canal. Canal sem provedor configurado falha de forma permanente (vira `skipped` no worker). */
export class RoutingNotifier implements Notifier {
  constructor(private readonly byChannel: Partial<Record<OutboxChannel, Notifier>>) {}
  async send(msg: NotifierMessage): Promise<void> {
    const n = this.byChannel[msg.channel];
    if (!n) throw new NotifierError(`canal ${msg.channel} desligado`, true);
    return n.send(msg);
  }
}

export function notifierFromEnv(env: NodeJS.ProcessEnv, readSecret: (n: string) => string | undefined, log: (o: object, m: string) => void): Notifier {
  const provider = env['EMAIL_PROVIDER'] || 'console';
  const key = readSecret('EMAIL_API_KEY');
  const email: Notifier = provider === 'resend' && key ? new ResendEmailNotifier(key, env['EMAIL_FROM'] || 'Tech Woman <nao-responda@techwoman.dev>') : new ConsoleNotifier(log);
  const waToken = readSecret('WHATSAPP_TOKEN');
  const waId = env['WHATSAPP_PHONE_NUMBER_ID'];
  const whatsapp = ['1', 'true'].includes((env['WHATSAPP_ENABLED'] || '').toLowerCase()) && waToken && waId ? new WhatsAppCloudNotifier(waToken, waId) : undefined;
  return new RoutingNotifier({ email, ...(whatsapp ? { whatsapp } : {}) });
}
