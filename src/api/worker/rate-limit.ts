import type { OutboxChannel } from '@tw/shared';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Balde de fichas por canal, no relógio real (o do contexto é injetável e não anda sozinho nos testes).
 * `perSec` envios por segundo, sem rajada acima disso; `pause` segura o canal depois de um 429 do provedor.
 * Vale por processo: com N réplicas do worker, cada uma deve receber 1/N do limite do provedor.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private pausedUntil = 0;
  constructor(readonly perSec: number, private readonly clock: () => number = Date.now) {
    this.tokens = perSec;
    this.last = clock();
  }

  /** ms até poder enviar de novo (0 = já pode). */
  waitMs(): number {
    const now = this.clock();
    if (now < this.pausedUntil) return this.pausedUntil - now;
    this.tokens = Math.min(this.perSec, this.tokens + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.perSec) * 1000);
  }

  /** Espera a vez e gasta uma ficha. Devolve false se for parar (pausa longa ou encerramento). */
  async take(opts: { maxWaitMs: number; isStopping?: () => boolean }): Promise<boolean> {
    for (;;) {
      if (opts.isStopping?.()) return false;
      const w = this.waitMs();
      if (w === 0) {
        this.tokens -= 1;
        return true;
      }
      if (w > opts.maxWaitMs) return false;
      await sleep(w);
    }
  }

  pause(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.clock() + ms);
    this.tokens = 0;
  }

  isPaused(): boolean {
    return this.clock() < this.pausedUntil;
  }
}

export type RateLimiters = Partial<Record<OutboxChannel, RateLimiter>>;

/** Padrão do e-mail: 8/s, abaixo dos 10/s do Resend (o que sobra absorve o relógio de cada lado). */
export const DEFAULT_EMAIL_MAX_PER_SEC = 8;

/** EMAIL_MAX_PER_SEC (padrão 8) e WHATSAPP_MAX_PER_SEC (padrão sem limite); 0 desliga o limite do canal. */
export function rateLimitersFromEnv(env: NodeJS.ProcessEnv): RateLimiters {
  const read = (name: string, def: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return def;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} inválido: "${raw}" (envios por segundo, 0 = sem limite)`);
    return n;
  };
  const email = read('EMAIL_MAX_PER_SEC', DEFAULT_EMAIL_MAX_PER_SEC);
  const whatsapp = read('WHATSAPP_MAX_PER_SEC', 0);
  return { ...(email > 0 ? { email: new RateLimiter(email) } : {}), ...(whatsapp > 0 ? { whatsapp: new RateLimiter(whatsapp) } : {}) };
}

/**
 * EMAIL_CONCURRENCY (padrão 4): envios de e-mail simultâneos, para a latência do provedor (~100 ms) não segurar o ritmo
 * abaixo do limite. O WhatsApp fica em 1 para as mensagens de uma pessoa não trocarem de ordem.
 */
export function concurrencyFromEnv(env: NodeJS.ProcessEnv): Partial<Record<OutboxChannel, number>> {
  const raw = env['EMAIL_CONCURRENCY'];
  const n = raw === undefined || raw === '' ? 4 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error(`EMAIL_CONCURRENCY inválido: "${raw}" (1 a 20)`);
  return { email: n, whatsapp: 1 };
}
