import { z } from 'zod';
import { defineEndpoint, AreaKeySchema, EmailSchema, IdSchema, LinkedinInputSchema, MENTEE_NOTE_MAX, PhoneInputSchema, PreferredPeriodSchema, SlotIdSchema } from './common.js';
import { MenteeStaffViewSchema } from './entities.js';

const ExtraSessionAttendeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: EmailSchema,
  phone: PhoneInputSchema,
  linkedin: LinkedinInputSchema.optional(),
  area: AreaKeySchema,
  preferredPeriod: PreferredPeriodSchema,
  note: z.string().trim().max(MENTEE_NOTE_MAX).optional(),
  consentAccepted: z.literal(true),
}).strict();

export const E52 = defineEndpoint({
  code: 'E52',
  method: 'GET',
  path: '/mentor/extra-sessions/mentees',
  auth: 'staff',
  roles: ['mentor'],
  query: z.object({ q: z.string().trim().min(2).max(100) }).strict(),
  response: z.object({ items: z.array(MenteeStaffViewSchema) }),
});

export const E53BodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('existing'), slotId: SlotIdSchema, menteeId: IdSchema }).strict(),
  z.object({ type: z.literal('new'), slotId: SlotIdSchema, attendee: ExtraSessionAttendeeSchema }).strict(),
]);
export type E53Body = z.infer<typeof E53BodySchema>;

const ExtraSessionViewSchema = z.object({
  id: IdSchema,
  slotId: SlotIdSchema,
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  mentee: z.object({ id: IdSchema, name: z.string(), area: z.string() }),
  createdAt: z.string().datetime({ offset: true }),
});

export const E53 = defineEndpoint({
  code: 'E53',
  method: 'POST',
  path: '/mentor/extra-sessions',
  auth: 'staff',
  roles: ['mentor'],
  idempotent: true,
  body: E53BodySchema,
  response: ExtraSessionViewSchema,
});

export const E54 = defineEndpoint({
  code: 'E54',
  method: 'GET',
  path: '/mentor/extra-sessions',
  auth: 'staff',
  roles: ['mentor'],
  response: z.object({ items: z.array(ExtraSessionViewSchema) }),
});

export type ExtraSessionView = z.infer<typeof ExtraSessionViewSchema>;
