import { z } from 'zod';
import { AreaKeySchema, defineEndpoint, LinkedinInputSchema, MENTOR_BIO_MAX, MentorThemesSchema, PhoneInputSchema } from './common.js';
import { UserViewSchema } from './entities.js';

/** E28 · PATCH /mentor/profile · M2 */
export const E28BodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    linkedin: LinkedinInputSchema.nullable().optional(),
    /** WhatsApp; `null` apaga. */
    phone: PhoneInputSchema.nullable().optional(),
    photoUrl: z.string().url().max(500).nullable().optional(),
    areas: z.array(AreaKeySchema).max(20).optional(),
    themes: MentorThemesSchema.optional(),
    bio: z.string().trim().max(MENTOR_BIO_MAX).nullable().optional(),
  })
  .strict();
export type E28Body = z.infer<typeof E28BodySchema>;
export const E28ResponseSchema = z.object({ user: UserViewSchema });
export type E28Response = z.infer<typeof E28ResponseSchema>;

export const E28 = defineEndpoint({
  code: 'E28',
  method: 'PATCH',
  path: '/mentor/profile',
  auth: 'staff',
  roles: ['mentor'],
  body: E28BodySchema,
  response: E28ResponseSchema,
});
