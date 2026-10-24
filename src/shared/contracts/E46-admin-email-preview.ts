import { z } from 'zod';
import { defineEndpoint } from './common.js';

/** Ids dos 6 layouts (iguais aos de `src/api/notifications/templates/email/subjects.ts`). */
export const EMAIL_PREVIEW_TYPES = [
  '01-inscricao-recebida',
  '02-convite-horario',
  '03-confirmacao',
  '04-convite-expirado',
  '05-cancelamento-mentora',
  '06-acesso-mentora',
] as const;
export const EmailPreviewTypeSchema = z.enum(EMAIL_PREVIEW_TYPES);
export type EmailPreviewType = z.infer<typeof EmailPreviewTypeSchema>;

/** E46 · GET /admin/email-preview/:tipo · A7 · renderiza um layout com dados de exemplo */
export const E46ParamsSchema = z.object({ tipo: EmailPreviewTypeSchema });
export const E46ResponseSchema = z.object({ subject: z.string(), html: z.string(), text: z.string() });
export type E46Response = z.infer<typeof E46ResponseSchema>;

export const E46 = defineEndpoint({
  code: 'E46',
  method: 'GET',
  path: '/admin/email-preview/:tipo',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: E46ParamsSchema,
  response: E46ResponseSchema,
});
