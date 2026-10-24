import type { FastifyInstance } from 'fastify';
import { E47, HEADERS, WahaMessagePayloadSchema, WahaWebhookEventSchema } from '@tw/shared';
import type { AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { route } from '../lib/route.js';
import { verifyHmacSha512Hex } from '../lib/waha-hmac.js';
import { handlePresenceReply } from '../services/presence.js';
import { isInboundContactMessage } from '../domain/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** E47: corpo bruto, para conferir a assinatura antes de ler o JSON. */
    rawBody?: Buffer;
  }
}

export function registerWebhookRoutes(app: FastifyInstance, ctx: AppContext): void {
  // escopo próprio: aqui o JSON não é lido pelo parser, só guardado em bruto (os demais parsers ficam como estão)
  void app.register(async (sub) => {
    sub.removeContentTypeParser('application/json');
    sub.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
      req.rawBody = body as Buffer;
      done(null, {});
    });

    // E47 · POST /webhooks/waha · RN18 · sem login e sem CSRF; assinatura antes de tudo
    route(
      sub,
      ctx,
      E47,
      async ({ req }) => {
        const raw = req.rawBody ?? Buffer.alloc(0);
        if (!verifyHmacSha512Hex(ctx.config.wahaWebhookHmacKey, raw, req.headers[HEADERS.wahaHmac.toLowerCase()])) {
          throw new AppError('UNAUTHENTICATED', 'Assinatura inválida.');
        }
        let json: unknown;
        try {
          json = JSON.parse(raw.toString('utf8'));
        } catch {
          return { ok: true as const };
        }
        // evento que não nos interessa (ou fora do formato esperado): 200 para o WAHA não repetir
        const ev = WahaWebhookEventSchema.safeParse(json);
        if (!ev.success || ev.data.event !== 'message') return { ok: true as const };
        const msg = WahaMessagePayloadSchema.safeParse(ev.data.payload);
        if (!msg.success || !isInboundContactMessage(ev.data.event, msg.data)) return { ok: true as const };
        const result = await handlePresenceReply(ctx, msg.data, req.ip);
        if (result !== 'ignored' && result !== 'duplicate') ctx.log.info({ code: 'E47', result }, 'resposta de presença');
        return { ok: true as const };
      },
    );
  });
}
