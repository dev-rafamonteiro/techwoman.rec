import { z } from 'zod';
import { defineEndpoint, EmailSchema, IdParamsSchema, UserStatusSchema } from './common.js';
import { UserViewSchema } from './entities.js';

/** Papéis de administrador gerenciáveis em A8. */
export const AdminRoleSchema = z.enum(['admin', 'super_admin']);

/** E43 · GET /admin/users · A8 · usuários com papel admin ou super_admin */
export const E43ListQuerySchema = z.object({ status: UserStatusSchema.optional() }).strict();
export type E43ListQuery = z.input<typeof E43ListQuerySchema>;
export const E43ListResponseSchema = z.object({ items: z.array(UserViewSchema) });
export type E43ListResponse = z.infer<typeof E43ListResponseSchema>;

/** E43 · POST /admin/users · devolve a senha provisória uma única vez */
export const E43CreateBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    roles: z.array(AdminRoleSchema).min(1).max(2),
    sendPasswordByEmail: z.boolean().default(false),
  })
  .strict();
export type E43CreateBody = z.input<typeof E43CreateBodySchema>;
export const E43CreateResponseSchema = z.object({ user: UserViewSchema, provisionalPassword: z.string() });
export type E43CreateResponse = z.infer<typeof E43CreateResponseSchema>;

/**
 * E43 · PATCH /admin/users/:id · desativar, trocar papel, redefinir senha.
 * Invariante: LAST_SUPER_ADMIN se a operação deixaria zero super admins ativos (inclui remover o próprio papel).
 */
export const E43PatchBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: UserStatusSchema.optional(),
    roles: z.array(AdminRoleSchema).min(1).max(2).optional(),
    resetPassword: z.boolean().optional(),
    sendPasswordByEmail: z.boolean().optional(),
  })
  .strict();
export type E43PatchBody = z.infer<typeof E43PatchBodySchema>;
export const E43PatchResponseSchema = z.object({
  user: UserViewSchema,
  provisionalPassword: z.string().nullable(),
});
export type E43PatchResponse = z.infer<typeof E43PatchResponseSchema>;

export const E43List = defineEndpoint({
  code: 'E43',
  method: 'GET',
  path: '/admin/users',
  auth: 'staff',
  roles: ['super_admin'],
  query: E43ListQuerySchema,
  response: E43ListResponseSchema,
});
export const E43Create = defineEndpoint({
  code: 'E43',
  method: 'POST',
  path: '/admin/users',
  auth: 'staff',
  roles: ['super_admin'],
  body: E43CreateBodySchema,
  response: E43CreateResponseSchema,
});
export const E43Patch = defineEndpoint({
  code: 'E43',
  method: 'PATCH',
  path: '/admin/users/:id',
  auth: 'staff',
  roles: ['super_admin'],
  params: IdParamsSchema,
  body: E43PatchBodySchema,
  response: E43PatchResponseSchema,
});
