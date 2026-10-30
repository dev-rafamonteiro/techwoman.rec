import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  IdParamsSchema,
  LinkedinInputSchema,
  MENTOR_BIO_MAX,
  MentorThemeDomainsSchema,
  MentorThemesSchema,
  PhoneInputSchema,
  SlotIdSchema,
  UserStatusSchema,
} from './common.js';
import { UserViewSchema } from './entities.js';

/**
 * E32 · PATCH /admin/mentors/:id · A3
 * Desativar segue RN12 (MENTOR_HAS_APPOINTMENTS com `details` = mentorias futuras ativas) e revoga sessões.
 * `alsoAdmin` só é aceito de super admin.
 */
export const E32BodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    linkedin: LinkedinInputSchema.nullable().optional(),
    /** WhatsApp; `null` apaga. */
    phone: PhoneInputSchema.nullable().optional(),
    organization: z.string().trim().max(120).nullable().optional(),
    areas: z.array(AreaKeySchema).max(20).optional(),
    themes: MentorThemesSchema.optional(),
    themeDomains: MentorThemeDomainsSchema.optional(),
    bio: z.string().trim().max(MENTOR_BIO_MAX).nullable().optional(),
    photoUrl: z.string().url().max(500).nullable().optional(),
    availability: z.array(SlotIdSchema).max(100).optional(),
    status: UserStatusSchema.optional(),
    alsoAdmin: z.boolean().optional(),
  })
  .strict();
export type E32Body = z.infer<typeof E32BodySchema>;
export const E32ResponseSchema = z.object({ user: UserViewSchema });
export type E32Response = z.infer<typeof E32ResponseSchema>;

/** `details` do erro MENTOR_HAS_APPOINTMENTS (RN12). */
export const MentorHasAppointmentsDetailsSchema = z.object({
  appointments: z.array(
    z.object({
      id: z.string(),
      startAt: z.string(),
      tableNumber: z.number().int(),
      menteeName: z.string(),
      status: z.string(),
    }),
  ),
});
export type MentorHasAppointmentsDetails = z.infer<typeof MentorHasAppointmentsDetailsSchema>;

export const E32 = defineEndpoint({
  code: 'E32',
  method: 'PATCH',
  path: '/admin/mentors/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  body: E32BodySchema,
  response: E32ResponseSchema,
});
