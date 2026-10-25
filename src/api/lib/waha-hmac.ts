import { createHmac, timingSafeEqual } from 'node:crypto';

const SHA512_HEX = /^[0-9a-f]{128}$/i;

/**
 * E47 · Confere `X-Webhook-Hmac` do WAHA: HMAC-SHA512 em hex do corpo bruto (UTF-8), comparação em tempo constante.
 * Sem chave, sem header ou header fora do formato: false.
 */
export function verifyHmacSha512Hex(key: string | null | undefined, rawBody: Buffer | string, header: string | string[] | null | undefined): boolean {
  const got = Array.isArray(header) ? header[0] : header;
  if (!key || !got || !SHA512_HEX.test(got.trim())) return false;
  const expected = createHmac('sha512', key).update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(got.trim(), 'hex'));
}
