import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../ctx.js';
import { registerAdminAppointmentRoutes } from './admin-appointments.js';
import { registerAdminConfigRoutes } from './admin-config.js';
import { registerAdminMenteeRoutes } from './admin-mentees.js';
import { registerAdminMentorRoutes } from './admin-mentors.js';
import { registerAuthRoutes } from './auth.js';
import { registerEmailPreviewRoutes } from './email-preview.js';
import { registerInviteRoutes } from './invite.js';
import { registerMentorRoutes } from './mentor.js';
import { registerMentorExtraSessionRoutes } from './mentor-extra-sessions.js';
import { registerPublicRoutes } from './public.js';
import { registerShortLinkRoutes } from './short-links.js';
import { registerWebhookRoutes } from './webhooks.js';
import { registerBradescoMentorRoutes } from './bradesco-mentors.js';

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  registerPublicRoutes(app, ctx); // E01–E08
  registerBradescoMentorRoutes(app, ctx); // E49–E51
  registerAuthRoutes(app, ctx); // E10–E13
  registerMentorRoutes(app, ctx); // E20–E28 (E24 em invite.ts)
  registerMentorExtraSessionRoutes(app, ctx); // E52–E54
  registerInviteRoutes(app, ctx); // E24, E39 (POST)
  registerAdminMentorRoutes(app, ctx); // E30–E34
  registerAdminMenteeRoutes(app, ctx); // E35–E38
  registerAdminAppointmentRoutes(app, ctx); // E39 (PATCH)
  registerAdminConfigRoutes(app, ctx); // E40–E45
  registerEmailPreviewRoutes(app, ctx); // E46
  registerWebhookRoutes(app, ctx); // E47
  registerShortLinkRoutes(app, ctx); // E48
}
