import { z } from 'zod';
import { defineEndpoint, IdParamsSchema } from './common.js';
import { BradescoMentorInputSchema, BradescoMentorViewSchema } from './E49-bradesco-mentors.js';

export const E51 = defineEndpoint({
  code: 'E51',
  method: 'PATCH',
  path: '/admin/bradesco-mentors/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  body: BradescoMentorInputSchema,
  response: z.object({ item: BradescoMentorViewSchema }),
});
