import { z } from 'zod';
import { defineEndpoint, SlotIdSchema } from './common.js';
import { E03ResponseSchema } from './E03-public-me.js';

/**
 * E08 · POST /public/me/book · P6 · RN19 · aceita Idempotency-Key
 * O sistema escolhe mentora e mesa e cria a mentoria já `confirmed`. Erros: INVALID_STATE (fora do estado permitido),
 * SLOT_UNAVAILABLE (409) se o horário acabou de ser ocupado.
 */
export const E08BodySchema = z.object({ slotId: SlotIdSchema }).strict();
export type E08Body = z.infer<typeof E08BodySchema>;

/** Devolve o estado atualizado (mesmo formato de E03): P6 passa direto para "Confirmada". */
export const E08ResponseSchema = E03ResponseSchema;
export type E08Response = z.infer<typeof E08ResponseSchema>;

export const E08 = defineEndpoint({
  code: 'E08',
  method: 'POST',
  path: '/public/me/book',
  auth: 'mentee',
  idempotent: true,
  body: E08BodySchema,
  response: E08ResponseSchema,
});
