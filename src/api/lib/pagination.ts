import { AppError } from './errors.js';

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Cursor inválido.');
  }
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
