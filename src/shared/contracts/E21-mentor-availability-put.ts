import { z } from 'zod';
import { defineEndpoint, SlotIdSchema } from './common.js';
import { E20ResponseSchema } from './E20-mentor-availability-get.js';

/** E21 · PUT /mentor/availability · M3 · RN11 (SLOT_IN_USE se remover horário com mentoria ativa) */
export const E21BodySchema = z.object({ slotIds: z.array(SlotIdSchema).max(100) }).strict();
export type E21Body = z.infer<typeof E21BodySchema>;
export const E21ResponseSchema = E20ResponseSchema;

export const E21 = defineEndpoint({
  code: 'E21',
  method: 'PUT',
  path: '/mentor/availability',
  auth: 'staff',
  roles: ['mentor'],
  body: E21BodySchema,
  response: E21ResponseSchema,
});
