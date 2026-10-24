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
