import { z } from 'zod';
import { defineEndpoint, IdParamsSchema, OutboxChannelSchema, OutboxStatusSchema, OutboxTypeSchema, pageOf } from './common.js';
import { OutboxItemViewSchema } from './entities.js';

/** E44 · GET /admin/notifications · A9 */
export const E44ListQuerySchema = z
  .object({
    status: OutboxStatusSchema.optional(),
    channel: OutboxChannelSchema.optional(),
    type: OutboxTypeSchema.optional(),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export type E44ListQuery = z.input<typeof E44ListQuerySchema>;
export const E44ListResponseSchema = pageOf(OutboxItemViewSchema);
export type E44ListResponse = z.infer<typeof E44ListResponseSchema>;

/** E44 · POST /admin/notifications/:id/retry · só itens `failed` (volta para pending, attempts = 0) */
export const E44RetryResponseSchema = z.object({ item: OutboxItemViewSchema });
export type E44RetryResponse = z.infer<typeof E44RetryResponseSchema>;

export const E44List = defineEndpoint({
  code: 'E44',
  method: 'GET',
  path: '/admin/notifications',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E44ListQuerySchema,
  response: E44ListResponseSchema,
});
export const E44Retry = defineEndpoint({
  code: 'E44',
  method: 'POST',
  path: '/admin/notifications/:id/retry',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  response: E44RetryResponseSchema,
});

/** E44 · GET /admin/notifications/health · A9: a fila está andando? (por canal) */
export const OutboxLaneHealthSchema = z.object({
  channel: OutboxChannelSchema,
  /** Na fila e já na hora de sair (exclui lembretes agendados para depois). */
  due: z.number().int(),
  /** Agendados para depois (lembretes, novas tentativas). */
  scheduled: z.number().int(),
  sending: z.number().int(),
  failed: z.number().int(),
  /** Há quanto tempo o item vencido mais antigo espera (0 se nenhum). */
  oldestDueSeconds: z.number().int(),
  /** Há item na fila devolvido por limite do provedor (429/throttling). */
  rateLimited: z.boolean(),
});
export type OutboxLaneHealth = z.infer<typeof OutboxLaneHealthSchema>;
export const E44HealthResponseSchema = z.object({
  /** false quando algum canal tem item vencido esperando mais que `alertAfterSeconds`. */
  ok: z.boolean(),
  alertAfterSeconds: z.number().int(),
  channels: z.array(OutboxLaneHealthSchema),
});
export type E44HealthResponse = z.infer<typeof E44HealthResponseSchema>;
export const E44Health = defineEndpoint({
  code: 'E44',
  method: 'GET',
  path: '/admin/notifications/health',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E44HealthResponseSchema,
});
