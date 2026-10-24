import { z } from 'zod';
import { DeclineReasonSchema, defineEndpoint, PreferredPeriodSchema } from './common.js';
import { E03ResponseSchema } from './E03-public-me.js';

/** E04 · POST /public/me/actions · P6 · RN06, RN14 · aceita Idempotency-Key */
export const E04BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }).strict(),
  z.object({ action: z.literal('decline'), reason: DeclineReasonSchema }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
  z.object({ action: z.literal('update_preference'), preferredPeriod: PreferredPeriodSchema }).strict(),
]);
export type E04Body = z.infer<typeof E04BodySchema>;

/** Devolve o estado atualizado (mesmo formato de E03). Erros: INVITE_EXPIRED, INVITE_NOT_ACTIVE, INVALID_STATE. */
export const E04ResponseSchema = E03ResponseSchema;
export type E04Response = z.infer<typeof E04ResponseSchema>;

export const E04 = defineEndpoint({
  code: 'E04',
  method: 'POST',
  path: '/public/me/actions',
  auth: 'mentee',
  idempotent: true,
  body: E04BodySchema,
  response: E04ResponseSchema,
});
