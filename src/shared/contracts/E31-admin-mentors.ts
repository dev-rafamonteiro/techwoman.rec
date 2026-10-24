import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  EmailSchema,
  LinkedinInputSchema,
  MENTOR_BIO_MAX,
  SearchQSchema,
  SlotIdSchema,
  UserStatusSchema,
} from './common.js';
import { MentorListItemSchema, UserViewSchema } from './entities.js';

/** E31 · GET /admin/mentors · A2 */
export const E31ListQuerySchema = z
  .object({
    q: SearchQSchema.optional(),
    status: z.union([UserStatusSchema, z.literal('never_logged_in')]).optional(),
    area: AreaKeySchema.optional(),
  })
  .strict();
export type E31ListQuery = z.input<typeof E31ListQuerySchema>;
export const E31ListResponseSchema = z.object({ items: z.array(MentorListItemSchema) });
export type E31ListResponse = z.infer<typeof E31ListResponseSchema>;

/** E31 · POST /admin/mentors · A3 · devolve a senha provisória uma única vez */
export const E31CreateBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    linkedin: LinkedinInputSchema.nullable().optional(),
    organization: z.string().trim().max(120).nullable().optional(),
    areas: z.array(AreaKeySchema).max(20).default([]),
    bio: z.string().trim().max(MENTOR_BIO_MAX).nullable().optional(),
    photoUrl: z.string().url().max(500).nullable().optional(),
    availability: z.array(SlotIdSchema).max(100).default([]),
    /** "Também é admin": só super admin pode enviar `true`. */
    alsoAdmin: z.boolean().default(false),
    /** Envia a senha provisória por e-mail (outbox `staff_password`). */
    sendPasswordByEmail: z.boolean().default(false),
  })
  .strict();
export type E31CreateBody = z.input<typeof E31CreateBodySchema>;
export const E31CreateResponseSchema = z.object({
  user: UserViewSchema,
  provisionalPassword: z.string().describe('Mostrada uma única vez'),
});
export type E31CreateResponse = z.infer<typeof E31CreateResponseSchema>;

export const E31List = defineEndpoint({
  code: 'E31',
  method: 'GET',
  path: '/admin/mentors',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E31ListQuerySchema,
  response: E31ListResponseSchema,
});

export const E31Create = defineEndpoint({
  code: 'E31',
  method: 'POST',
  path: '/admin/mentors',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  body: E31CreateBodySchema,
  response: E31CreateResponseSchema,
});

