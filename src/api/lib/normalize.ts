// telefone: a regra mora em @tw/shared para a importação de mentoras (@tw/db) usar a mesma
import { normalizePhoneBR } from '@tw/shared';
import { AppError } from './errors.js';
export { normalizePhoneBR };

/**
 * WhatsApp opcional da mentora (E28, E31, E32): undefined = não mexe, null = sem telefone, texto = E.164.
 * Inválido vira VALIDATION_ERROR no campo `phone` (o schema já recusa string vazia).
 */
export function parseOptionalPhone(input: string | null | undefined): string | null | undefined {
  if (input === null || input === undefined) return input;
  const phone = normalizePhoneBR(input);
  if (!phone) throw new AppError('VALIDATION_ERROR', 'Telefone inválido. Informe DDD e número.', { details: { field: 'phone' } });
  return phone;
}

/** LinkedIn: aceita só o usuário, "linkedin.com/in/x" ou a URL completa; guarda a URL completa. Null se vazio ou inválido. */
export function normalizeLinkedin(input: string | null | undefined): string | null | undefined {
  if (input === null || input === undefined) return input;
  const v = input.trim();
  if (!v) return null;
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/([A-Za-z0-9\-_%.]{2,100})\/?(?:\?.*)?$/i.exec(v);
  if (m) return `https://www.linkedin.com/in/${m[1]}`;
  if (/^[A-Za-z0-9\-_%.]{2,100}$/.test(v)) return `https://www.linkedin.com/in/${v}`;
  return undefined;
}
