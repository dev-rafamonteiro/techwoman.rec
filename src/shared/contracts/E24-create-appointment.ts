import { z } from 'zod';
import { defineEndpoint, IdSchema, SlotIdSchema } from './common.js';
import { MentorAppointmentViewSchema } from './entities.js';

/**
 * E24 · POST /mentor/appointments · M5 · RN04, RN05 · aceita Idempotency-Key
 * 409: MENTEE_TAKEN, TABLE_TAKEN, MENTOR_BUSY, SLOT_UNAVAILABLE.
 */
export const E24BodySchema = z.object({ menteeId: IdSchema, slotId: SlotIdSchema, tableId: IdSchema }).strict();
export type E24Body = z.infer<typeof E24BodySchema>;

export const E24ResponseSchema = z.object({ appointment: MentorAppointmentViewSchema });
export type E24Response = z.infer<typeof E24ResponseSchema>;

export const E24 = defineEndpoint({
  code: 'E24',
  method: 'POST',
  path: '/mentor/appointments',
  auth: 'staff',
  roles: ['mentor'],
  idempotent: true,
  body: E24BodySchema,
  response: E24ResponseSchema,
});
