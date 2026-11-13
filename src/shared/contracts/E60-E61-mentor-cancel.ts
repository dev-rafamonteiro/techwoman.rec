import { z } from 'zod';
import { defineEndpoint, IdParamsSchema } from './common.js';

/**
 * RN25 · Cancelamento pela mentora. Com a opção desligada (padrão), E26 `cancel` responde 403 e a mentora só pede o
 * cancelamento (E60): cada administradora recebe o pedido por e-mail e cancela pelo painel. A opção liga/desliga
 * pelo A1 (E61, admin ou super admin).
 */

/** E60 · POST /mentor/appointments/:id/cancel-request · M6 · aceita Idempotency-Key */
export const E60BodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export type E60Body = z.infer<typeof E60BodySchema>;

/** `notified`: quantas administradoras receberão o e-mail. */
export const E60ResponseSchema = z.object({ notified: z.number().int() });
export type E60Response = z.infer<typeof E60ResponseSchema>;

export const E60 = defineEndpoint({
  code: 'E60',
  method: 'POST',
  path: '/mentor/appointments/:id/cancel-request',
  auth: 'staff',
  roles: ['mentor'],
  idempotent: true,
  params: IdParamsSchema,
  body: E60BodySchema,
  response: E60ResponseSchema,
});

/** E61 · PUT /admin/mentor-cancel · A1 · liga ou desliga o cancelamento pela mentora */
export const E61BodySchema = z.object({ enabled: z.boolean() }).strict();
export type E61Body = z.infer<typeof E61BodySchema>;

export const E61ResponseSchema = z.object({ mentorCancelEnabled: z.boolean() });
export type E61Response = z.infer<typeof E61ResponseSchema>;

export const E61 = defineEndpoint({
  code: 'E61',
  method: 'PUT',
  path: '/admin/mentor-cancel',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  body: E61BodySchema,
  response: E61ResponseSchema,
});
