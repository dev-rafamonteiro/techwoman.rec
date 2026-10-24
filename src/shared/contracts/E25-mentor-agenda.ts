import { z } from 'zod';
import { defineEndpoint, SlotSchema } from './common.js';
import { MentorAppointmentViewSchema } from './entities.js';

/** E25 · GET /mentor/appointments · M6 · agenda do dia da mentora */
export const E25ResponseSchema = z.object({
  timezone: z.string(),
  serverNow: z.string(),
  /** Um item por horário disponível da mentora (ou com mentoria): `appointment` null = livre. */
  slots: z.array(z.object({ slot: SlotSchema, appointment: MentorAppointmentViewSchema.nullable() })),
});
export type E25Response = z.infer<typeof E25ResponseSchema>;

export const E25 = defineEndpoint({
  code: 'E25',
  method: 'GET',
  path: '/mentor/appointments',
  auth: 'staff',
  roles: ['mentor'],
  response: E25ResponseSchema,
});
