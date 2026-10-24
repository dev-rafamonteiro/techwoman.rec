import { z } from 'zod';
import { defineEndpoint, EmailSchema, OkSchema } from './common.js';

/** E05 · POST /public/resend-link · P6 · Turnstile · sempre 202, exista ou não o e-mail */
export const E05BodySchema = z.object({ email: EmailSchema, turnstileToken: z.string().min(1).max(4096) }).strict();
export type E05Body = z.infer<typeof E05BodySchema>;

export const E05 = defineEndpoint({
  code: 'E05',
  method: 'POST',
  path: '/public/resend-link',
  auth: 'public',
  turnstile: true,
  body: E05BodySchema,
  response: OkSchema,
});
