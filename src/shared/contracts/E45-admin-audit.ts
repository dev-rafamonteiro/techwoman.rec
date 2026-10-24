import { z } from 'zod';
import { defineEndpoint, IdSchema, pageOf } from './common.js';
import { AuditEntryViewSchema } from './entities.js';

/** E45 · GET /admin/audit · A9 · filtro por usuário e ação (RN17) */
export const E45QuerySchema = z
  .object({
    actorId: IdSchema.optional(),
    action: z.string().trim().max(60).optional(),
    entity: z.string().trim().max(40).optional(),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export type E45Query = z.input<typeof E45QuerySchema>;
export const E45ResponseSchema = pageOf(AuditEntryViewSchema);
export type E45Response = z.infer<typeof E45ResponseSchema>;

export const E45 = defineEndpoint({
  code: 'E45',
  method: 'GET',
  path: '/admin/audit',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E45QuerySchema,
  response: E45ResponseSchema,
});
