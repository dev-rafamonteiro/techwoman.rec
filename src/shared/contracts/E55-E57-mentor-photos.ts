import { z } from 'zod';
import { defineEndpoint, IdSchema } from './common.js';

/** Limite do arquivo já reduzido no navegador (a tela manda um JPEG de até 640 px no maior lado). */
export const MENTOR_PHOTO_MAX_BYTES = 512 * 1024;

export const MentorPhotoResponseSchema = z.object({ photoUrl: z.string().url() });
export type MentorPhotoResponse = z.infer<typeof MentorPhotoResponseSchema>;

/** E55 · POST /mentor/photo · M2, M3 · multipart/form-data, campo `file` (JPEG). Também vale com a senha provisória. */
export const E55 = defineEndpoint({
  code: 'E55',
  method: 'POST',
  path: '/mentor/photo',
  auth: 'staff',
  roles: ['mentor'],
  response: MentorPhotoResponseSchema,
  contentType: 'multipart/form-data',
});

/** E56 · POST /admin/mentors/:id/photo · A3 · multipart/form-data, campo `file` (JPEG). */
export const E56 = defineEndpoint({
  code: 'E56',
  method: 'POST',
  path: '/admin/mentors/:id/photo',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: z.object({ id: IdSchema }),
  response: MentorPhotoResponseSchema,
  contentType: 'multipart/form-data',
});

/** E57 · GET /public/mentors/:id/photo · P7 · público; só de mentora ativa. Com o `v` do photoUrl, cache de 1 ano. */
export const E57 = defineEndpoint({
  code: 'E57',
  method: 'GET',
  path: '/public/mentors/:id/photo',
  auth: 'public',
  params: z.object({ id: IdSchema }),
  query: z.object({ v: z.string().max(64).optional() }),
  contentType: 'image/jpeg',
});
