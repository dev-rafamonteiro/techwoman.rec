import { z } from 'zod';
import { defineEndpoint, IdParamsSchema } from './common.js';

/** E34 · POST /admin/mentors/:id/reset-password · A2, A3 · revoga sessões; senha mostrada uma única vez */
export const E34BodySchema = z.object({ sendByEmail: z.boolean().default(false) }).strict();
export type E34Body = z.input<typeof E34BodySchema>;
export const E34ResponseSchema = z.object({ provisionalPassword: z.string() });
export type E34Response = z.infer<typeof E34ResponseSchema>;

export const E34 = defineEndpoint({
  code: 'E34',
  method: 'POST',
  path: '/admin/mentors/:id/reset-password',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  body: E34BodySchema,
  response: E34ResponseSchema,
});
