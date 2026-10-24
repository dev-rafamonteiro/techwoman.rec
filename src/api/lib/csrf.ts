import type { FastifyRequest } from 'fastify';
import { HEADERS, REQUESTED_WITH_VALUE } from '@tw/shared';
import type { Config } from '../config.js';
import { AppError } from './errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Proteção CSRF (PLAN): header X-Requested-With obrigatório + checagem de Origin nas rotas que escrevem. */
export function checkCsrf(req: FastifyRequest, config: Config): void {
  if (SAFE.has(req.method)) return;
  const h = req.headers[HEADERS.requestedWith.toLowerCase()];
  if (h !== REQUESTED_WITH_VALUE) throw new AppError('CSRF', 'Requisição não autorizada.');
  const origin = req.headers['origin'];
  if (origin) {
    let ok = config.allowedOrigins.includes(origin);
    if (!ok && !config.isProd) {
      try {
        const u = new URL(origin);
        ok = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      } catch {
        ok = false;
      }
    }
    if (!ok) throw new AppError('CSRF', 'Origem não permitida.');
  }
}
