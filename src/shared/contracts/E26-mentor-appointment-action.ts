import { z } from 'zod';
import { defineEndpoint, IdParamsSchema } from './common.js';
import { MentorAppointmentViewSchema } from './entities.js';

/** E26 · PATCH /mentor/appointments/:id · M6 · RN08–RN10 · aceita Idempotency-Key */
export const E26BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm_in_person') }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('finish') }).strict(),
  z.object({ action: z.literal('no_show') }).strict(),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(200).optional() }).strict(),
]);
export type E26Body = z.infer<typeof E26BodySchema>;

export const E26ResponseSchema = z.object({ appointment: MentorAppointmentViewSchema });
export type E26Response = z.infer<typeof E26ResponseSchema>;

export const E26 = defineEndpoint({
  code: 'E26',
  method: 'PATCH',
  path: '/mentor/appointments/:id',
  auth: 'staff',
  roles: ['mentor'],
  idempotent: true,
  params: IdParamsSchema,
  body: E26BodySchema,
  response: E26ResponseSchema,
});
