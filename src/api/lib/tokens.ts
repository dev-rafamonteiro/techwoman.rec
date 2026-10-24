import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { ObjectId } from 'mongodb';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Token do link pessoal da participante: HMAC-SHA256 (32 bytes, base64url) derivado de segredo + id + versão.
 * No banco só fica o SHA-256 (`tokenHash`); como é derivável, o reenvio do link (E02/E05/E36) não precisa guardar
 * o token em claro na outbox nem rotacionar o link. Incrementar `tokenVersion` invalida o link anterior.
 */
export function menteeToken(secret: string, menteeId: ObjectId | string, tokenVersion: number): string {
  return createHmac('sha256', secret).update(`mentee-token:${String(menteeId)}:${tokenVersion}`).digest('base64url');
}

export const hashMenteeToken = (token: string) => sha256Hex(token);

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function personalPath(token: string): string {
  return `/mentoria/minha?t=${token}`;
}

export function personalLink(baseUrl: string, token: string): string {
  return `${baseUrl}${personalPath(token)}`;
}
