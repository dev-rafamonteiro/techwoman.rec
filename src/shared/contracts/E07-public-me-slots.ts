import { z } from 'zod';
import { defineEndpoint, IsoDateTimeSchema, SlotIdSchema } from './common.js';

/**
 * E07 · GET /public/me/slots (header X-Mentee-Token) · P6 · RN19
 * Horários livres para a participante escolher sozinha (só `waiting` com `lastOutcome = "declined_schedule"`).
 * `matchesPeriod` marca os do período preferido (RN14). Erro: INVALID_STATE (409) fora do estado permitido.
 */
export const E07ItemSchema = z.object({
  slotId: SlotIdSchema,
  startAt: IsoDateTimeSchema,
  endAt: IsoDateTimeSchema,
  matchesPeriod: z.boolean(),
});
export type E07Item = z.infer<typeof E07ItemSchema>;

export const E07ResponseSchema = z.object({ items: z.array(E07ItemSchema) });
export type E07Response = z.infer<typeof E07ResponseSchema>;

export const E07 = defineEndpoint({
  code: 'E07',
  method: 'GET',
  path: '/public/me/slots',
  auth: 'mentee',
  response: E07ResponseSchema,
});
