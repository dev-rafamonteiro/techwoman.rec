import { z } from 'zod';
import { defineEndpoint } from './common.js';
import { MenteeFiltersSchema } from './E35-admin-mentees.js';

/** E37 · GET /admin/mentees/export.csv · A4 · mesmos filtros do E35 (sem cursor) · registrado na auditoria */
export const E37QuerySchema = MenteeFiltersSchema.strict();
export type E37Query = z.input<typeof E37QuerySchema>;

export const E37_CSV_COLUMNS = [
  'nome',
  'email',
  'whatsapp',
  'linkedin',
  'area',
  'periodo',
  'status',
  'prioridade',
  'mentora',
  'mesa',
  'horario',
  'inscrita_em',
] as const;

export const E37 = defineEndpoint({
  code: 'E37',
  method: 'GET',
  path: '/admin/mentees/export.csv',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E37QuerySchema,
  contentType: 'text/csv; charset=utf-8',
});
