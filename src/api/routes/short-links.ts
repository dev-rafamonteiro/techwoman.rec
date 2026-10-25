import type { FastifyInstance } from 'fastify';
import { E48 } from '@tw/shared';
import type { AppContext } from '../ctx.js';
import { RAW, route } from '../lib/route.js';
import { resolveShortLink } from '../lib/short-links.js';

export function registerShortLinkRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E48 · GET /l/:code (rota /api/l/:code) · sempre 302, mesma resposta para inexistente, inválido, revogado ou vencido
  route(
    app,
    ctx,
    E48,
    async ({ reply, params }) => {
      const location = await resolveShortLink(ctx.c, ctx.config.menteeTokenSecret, params.code, ctx.now());
      void reply.code(302).header('Location', location).header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').send();
      return RAW;
    },
    // por IP (o código é credencial): o Wi-Fi do evento sai por poucos IPs, então o limite é alto
    { rateLimit: { max: 600, timeWindow: '1 minute', keyGenerator: (req) => `l:${req.ip}` } },
  );
}
