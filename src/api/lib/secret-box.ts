import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Segredo cifrado como fica na `outbox` (campo `secret`). */
export interface SealedSecret {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

/** Aceita 32 bytes em base64 (44 caracteres) ou em hex (64 caracteres). */
export function parseOutboxKey(raw: string): Buffer {
  const s = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
  if (buf.length !== 32) throw new Error('OUTBOX_KEY (ou OUTBOX_KEY_FILE) deve ter 32 bytes em base64 (44 caracteres) ou hex (64)');
  return buf;
}

/** AES-256-GCM com IV de 12 bytes; `aad` (a dedupeKey) amarra o texto cifrado ao item da outbox. */
export function sealSecret(key: Buffer, plain: string, aad: string): SealedSecret {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

export function openSecret(key: Buffer, sealed: SealedSecret, aad: string): string {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(sealed.ct, 'base64')), d.final()]).toString('utf8');
}
