import { ERROR_HTTP_STATUS, type ErrorBody, type ErrorCode } from '@tw/shared';
import { mapDuplicateKeyError } from '@tw/db';
import type { RuleError } from '../domain/index.js';

/** Erro de negócio com código do contrato; vira `{ code, message, details? }`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly headers: Record<string, string> | undefined;
  constructor(code: ErrorCode, message: string, opts: { details?: unknown; status?: number; headers?: Record<string, string> } = {}) {
    super(message);
    this.code = code;
    this.status = opts.status ?? ERROR_HTTP_STATUS[code];
    this.details = opts.details;
    this.headers = opts.headers;
  }
  toBody(): ErrorBody {
    return { code: this.code, message: this.message, ...(this.details === undefined ? {} : { details: this.details }) };
  }
}

export const notFound = (what = 'Recurso') => new AppError('NOT_FOUND', `${what} não encontrado.`);
export const forbidden = (message = 'Você não tem acesso a esta área.') => new AppError('FORBIDDEN', message);

export function fromRuleError(e: RuleError): AppError {
  return new AppError(e.code, e.message, { details: e.details });
}

/** Converte E11000 de `appointments` em conflito de agenda (409). Devolve null se não for. */
export function scheduleConflictFrom(err: unknown): AppError | null {
  const code = mapDuplicateKeyError(err);
  if (!code) return null;
  const message =
    code === 'TABLE_TAKEN'
      ? 'A mesa acabou de ser ocupada nesse horário.'
      : code === 'MENTOR_BUSY'
        ? 'A mentora já tem uma mentoria nesse horário.'
        : 'A participante já foi escolhida.';
  return new AppError(code, message);
}

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
