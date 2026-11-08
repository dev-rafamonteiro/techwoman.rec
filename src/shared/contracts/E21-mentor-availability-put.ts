import { z } from 'zod';
import { defineEndpoint, IsoDateTimeSchema, SlotIdSchema } from './common.js';
import { E20ResponseSchema } from './E20-mentor-availability-get.js';

/**
 * E21 · PUT /mentor/availability · M3 · RN11 (SLOT_IN_USE se remover horário com mentoria ativa) e RN22 (SLOT_FULL se
 * ADICIONAR horário lotado; `details` = SlotFullDetails). Remover horário nunca esbarra na RN22.
 */
export const E21BodySchema = z.object({ slotIds: z.array(SlotIdSchema).max(100) }).strict();
export type E21Body = z.infer<typeof E21BodySchema>;
export const E21ResponseSchema = E20ResponseSchema;

/** RN22 · Lotação de um horário (details de SLOT_FULL em E21, avisos de E32 e E30). */
export const SlotCapacityInfoSchema = z.object({
  slotId: SlotIdSchema,
  startAt: IsoDateTimeSchema,
  mentorsAvailable: z.number().int(),
  capacity: z.number().int(),
});
export type SlotCapacityInfo = z.infer<typeof SlotCapacityInfoSchema>;
/** `details` do erro SLOT_FULL (RN22): horários lotados que ela tentou adicionar (`mentorsAvailable` sem contar ela). */
export const SlotFullDetailsSchema = z.object({ slots: z.array(SlotCapacityInfoSchema) });
export type SlotFullDetails = z.infer<typeof SlotFullDetailsSchema>;

export const E21 = defineEndpoint({
  code: 'E21',
  method: 'PUT',
  path: '/mentor/availability',
  auth: 'staff',
  roles: ['mentor'],
  body: E21BodySchema,
  response: E21ResponseSchema,
});
