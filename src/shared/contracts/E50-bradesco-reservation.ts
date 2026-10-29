import { z } from 'zod';
import { defineEndpoint, EmailSchema, PhoneInputSchema } from './common.js';

export const E50BodySchema = z.object({
  mentorId: z.string().regex(/^[a-f\d]{24}$/i),
  slotId: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(120),
  email: EmailSchema,
  phone: PhoneInputSchema,
  consent: z.object({ accepted: z.literal(true), version: z.string().min(1).max(40) }).strict(),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

export const E50ResponseSchema = z.object({
  mentorName: z.string(),
  slotTime: z.string(),
  topic: z.string(),
  eventDate: z.string(),
});

export const E50 = defineEndpoint({
  code: 'E50',
  method: 'POST',
  path: '/public/bradesco-reservations',
  auth: 'public',
  turnstile: true,
  body: E50BodySchema,
  response: E50ResponseSchema,
});
