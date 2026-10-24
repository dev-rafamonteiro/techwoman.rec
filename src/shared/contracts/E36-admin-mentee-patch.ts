import { z } from 'zod';
import { defineEndpoint, IdParamsSchema } from './common.js';
import { MenteeAdminViewSchema } from './entities.js';

/**
 * E36 · PATCH /admin/mentees/:id · A4 · prioridade, cancelar, reenviar link, anonimizar (pedido de exclusão, LGPD).
 * "Agendar manualmente" usa E39.
 */
export const E36BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_priority'), priority: z.boolean() }).strict(),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(200).optional() }).strict(),
  z.object({ action: z.literal('resend_link') }).strict(),
  z.object({ action: z.literal('anonymize') }).strict(),
]);
export type E36Body = z.infer<typeof E36BodySchema>;
export const E36ResponseSchema = z.object({ mentee: MenteeAdminViewSchema });
export type E36Response = z.infer<typeof E36ResponseSchema>;

export const E36 = defineEndpoint({
  code: 'E36',
  method: 'PATCH',
  path: '/admin/mentees/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  body: E36BodySchema,
  response: E36ResponseSchema,
});
