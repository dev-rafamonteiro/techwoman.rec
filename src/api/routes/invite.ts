import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../ctx.js';

/** E24 (POST /mentor/appointments) e E39 (POST /admin/appointments): aguardam aprovação do plano de convite. */
export function registerInviteRoutes(_app: FastifyInstance, _ctx: AppContext): void {
  // implementado após aprovação
}
