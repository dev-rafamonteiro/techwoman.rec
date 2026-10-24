import type { z } from 'zod';
import { defineEndpoint } from './common.js';
import { E10ResponseSchema } from './E10-login.js';

/** E12 · GET /auth/me · todas as telas autenticadas */
export const E12ResponseSchema = E10ResponseSchema;
export type E12Response = z.infer<typeof E12ResponseSchema>;

export const E12 = defineEndpoint({
  code: 'E12',
  method: 'GET',
  path: '/auth/me',
  auth: 'staff',
  response: E12ResponseSchema,
});
