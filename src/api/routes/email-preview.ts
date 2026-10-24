import type { FastifyInstance } from 'fastify';
import { E46 } from '@tw/shared';
import type { AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { route } from '../lib/route.js';
import { renderEmailPreview, RenderError } from '../notifications/render.js';

export function registerEmailPreviewRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E46 · GET /admin/email-preview/:tipo · A7 · layout com dados de exemplo
  route(app, ctx, E46, async ({ params }) => {
    try {
      return renderEmailPreview(params.tipo);
    } catch (err) {
      if (err instanceof RenderError) throw new AppError('INTERNAL', `Não foi possível gerar a prévia: ${err.message}`, { status: 500 });
      throw err;
    }
  });
}
