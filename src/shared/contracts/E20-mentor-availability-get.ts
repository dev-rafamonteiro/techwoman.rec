import { z } from 'zod';
import { defineEndpoint, IdSchema, SlotSchema } from './common.js';

/** E20 · GET /mentor/availability · M3 · horários do dia + quais estão travados por mentoria */
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
