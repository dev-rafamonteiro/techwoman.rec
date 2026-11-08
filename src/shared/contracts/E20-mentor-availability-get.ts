import { z } from 'zod';
import { defineEndpoint, IdSchema, SlotSchema } from './common.js';

/** E20 · GET /mentor/availability · M3 · horários do dia + quais estão travados por mentoria + lotação (RN22) */
export const E20ResponseSchema = z.object({
  timezone: z.string(),
  slots: z.array(
    z.object({
      slot: SlotSchema,
      available: z.boolean(),
      /** Mentoria invited/confirmed/in_progress neste horário (RN11): não pode ser desligado. */
      locked: z
        .object({ appointmentId: IdSchema, menteeName: z.string() })
        .nullable(),
      /** RN22 · Mentoras ativas com o horário na disponibilidade (ela inclusa, se marcou). */
      mentorsAvailable: z.number().int(),
      /** RN22 · Mesas ativas do evento: limite de mentoras por horário. */
      capacity: z.number().int(),
      /** RN22 · `mentorsAvailable >= capacity`: quem não marcou o horário não consegue marcá-lo (E21 SLOT_FULL). */
      full: z.boolean(),
    }),
  ),
});
export type E20Response = z.infer<typeof E20ResponseSchema>;

export const E20 = defineEndpoint({
  code: 'E20',
  method: 'GET',
  path: '/mentor/availability',
  auth: 'staff',
  roles: ['mentor'],
  response: E20ResponseSchema,
});
