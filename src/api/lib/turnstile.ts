import type { Config } from '../config.js';
import { AppError } from './errors.js';

/** Verificação do Cloudflare Turnstile (plugável: sem segredo em dev/test aceita qualquer token). */
export async function verifyTurnstile(config: Config, token: string, ip: string | undefined, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (config.turnstileMode === 'test') {
    if (token === 'test-ok') return;
    throw new AppError('TURNSTILE_FAILED', 'Verificação anti-robô inválida.');
  }
  if (!config.turnstileSecret) throw new AppError('TURNSTILE_FAILED', 'Verificação anti-robô indisponível.');
  const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as { success?: boolean };
    if (json.success) return;
  } catch {
    // falha de rede conta como falha de verificação
  }
  throw new AppError('TURNSTILE_FAILED', 'Não foi possível validar a verificação anti-robô. Tente de novo.');
}
