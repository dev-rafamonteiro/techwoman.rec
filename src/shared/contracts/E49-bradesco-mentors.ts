import { z } from 'zod';
import { defineEndpoint } from './common.js';

export const BradescoMentorThemeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domains: z.array(z.string().trim().min(1).max(120)).max(10),
}).strict();

export const BradescoMentorSlotSchema = z.object({
  id: z.string().regex(/^\d{2}:\d{2}$/),
  time: z.string().trim().min(1).max(40),
  topic: z.string().trim().min(1).max(160),
}).strict();

const BradescoMentorAvailableSlotSchema = z.object({
  id: z.string().regex(/^\d{2}:\d{2}$/),
  time: z.string().trim().min(1).max(40),
  topic: z.string().trim().min(1).max(160),
  available: z.boolean(),
}).strict();

const BradescoMentorFields = {
  name: z.string().trim().min(2).max(120),
  expertise: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(80),
  linkedin: z.string().url().max(500).nullable(),
  bio: z.string().trim().max(1200),
  photoUrl: z.string().url().max(500).nullable(),
  themes: z.array(BradescoMentorThemeSchema).min(1).max(2),
  slots: z.array(BradescoMentorSlotSchema).max(30),
  active: z.boolean(),
};

export const BradescoMentorInputSchema = z.object(BradescoMentorFields).strict().superRefine((mentor, ctx) => {
  const slotIds = mentor.slots.map((slot) => slot.id);
  if (new Set(slotIds).size !== slotIds.length) {
    ctx.addIssue({ code: 'custom', path: ['slots'], message: 'Cada horário da mentora deve ser único.' });
  }
});
export type BradescoMentorInput = z.infer<typeof BradescoMentorInputSchema>;

export const BradescoMentorViewSchema = z.object({
  ...BradescoMentorFields,
  id: z.string(),
  slots: z.array(BradescoMentorAvailableSlotSchema),
}).strict();
export type BradescoMentorView = z.infer<typeof BradescoMentorViewSchema>;

const BradescoMentorPublicViewSchema = z.object({
  name: BradescoMentorFields.name,
  expertise: BradescoMentorFields.expertise,
  city: BradescoMentorFields.city,
  linkedin: BradescoMentorFields.linkedin,
  bio: BradescoMentorFields.bio,
  photoUrl: BradescoMentorFields.photoUrl,
  themes: BradescoMentorFields.themes,
  id: z.string(),
  slots: z.array(BradescoMentorAvailableSlotSchema),
}).strict();

export const E49PublicResponseSchema = z.object({
  eventDate: z.string(),
  consentVersion: z.string(),
  items: z.array(BradescoMentorPublicViewSchema),
});
export type E49PublicResponse = z.infer<typeof E49PublicResponseSchema>;

export const E49AdminResponseSchema = z.object({ items: z.array(BradescoMentorViewSchema) });
export type E49AdminResponse = z.infer<typeof E49AdminResponseSchema>;

export const E49Public = defineEndpoint({
  code: 'E49',
  method: 'GET',
  path: '/public/bradesco-mentors',
  auth: 'public',
  response: E49PublicResponseSchema,
});

export const E49AdminList = defineEndpoint({
  code: 'E49',
  method: 'GET',
  path: '/admin/bradesco-mentors',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E49AdminResponseSchema,
});

export const E49AdminCreate = defineEndpoint({
  code: 'E49',
  method: 'POST',
  path: '/admin/bradesco-mentors',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  body: BradescoMentorInputSchema,
  response: z.object({ item: BradescoMentorViewSchema }),
});
