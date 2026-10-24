import { z } from 'zod';
import { defineEndpoint } from './common.js';

/** E06 · GET /public/calendar.ics?t=<token> · P6 e e-mail 3 · só mentoria confirmada · 404 em qualquer outro status */
export const E06QuerySchema = z.object({ t: z.string().min(1).max(200) }).strict();
export type E06Query = z.input<typeof E06QuerySchema>;

export const E06 = defineEndpoint({
  code: 'E06',
  method: 'GET',
  path: '/public/calendar.ics',
  auth: 'public',
  query: E06QuerySchema,
  contentType: 'text/calendar; charset=utf-8',
});
