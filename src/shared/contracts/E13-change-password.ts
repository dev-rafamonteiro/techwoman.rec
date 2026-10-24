import { z } from 'zod';
import { defineEndpoint, OkSchema, PasswordSchema } from './common.js';

/** E13 · POST /auth/change-password · M2 · exige senha atual; revoga as demais sessões */
export const E13BodySchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema })
  .strict();
export type E13Body = z.infer<typeof E13BodySchema>;

export const E13 = defineEndpoint({
  code: 'E13',
  method: 'POST',
  path: '/auth/change-password',
  auth: 'staff',
  body: E13BodySchema,
  response: OkSchema,
});
