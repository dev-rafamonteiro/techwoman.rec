import { z } from 'zod';
import { AreaKeySchema, defineEndpoint, QueryBoolSchema } from './common.js';

/**
 * E33 · POST /admin/mentors/import · A3 · multipart/form-data, campo `file` (CSV, até 2 MB).
 * Colunas do modelo: nome, email, linkedin, organizacao, areas, disponibilidade, whatsapp (opcional).
 * Fluxo: `?dryRun=true` devolve a prévia; sem dryRun grava e devolve as senhas provisórias (uma única vez).
 */
export const MENTOR_IMPORT_FIELD = 'file';
export const MENTOR_IMPORT_COLUMNS = ['nome', 'email', 'linkedin', 'organizacao', 'areas', 'disponibilidade', 'whatsapp'] as const;
export const MENTOR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const E33QuerySchema = z
  .object({
    dryRun: QueryBoolSchema.optional(),
    /** O que fazer com e-mails já existentes (passo 3 de A3). */
    onExisting: z.enum(['update', 'skip']).optional(),
  })
  .strict();
export type E33Query = z.input<typeof E33QuerySchema>;

export const ImportRowSchema = z.object({
  line: z.number().int().describe('Linha no CSV (cabeçalho = 1)'),
  status: z.enum(['valid', 'error', 'exists']),
  errors: z.array(z.string()),
  data: z.object({
    name: z.string(),
    email: z.string(),
    linkedin: z.string().nullable(),
    /** WhatsApp em E.164 (coluna `whatsapp`); null se vazio. */
    phone: z.string().nullable(),
    organization: z.string().nullable(),
    areas: z.array(AreaKeySchema),
    availability: z.array(z.string()),
  }),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const E33ResponseSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(ImportRowSchema),
  summary: z.object({
    valid: z.number().int(),
    errors: z.number().int(),
    existing: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    skipped: z.number().int(),
  }),
  /** Só preenchido quando dryRun = false. */
  credentials: z.array(z.object({ email: z.string(), name: z.string(), provisionalPassword: z.string() })),
});
export type E33Response = z.infer<typeof E33ResponseSchema>;

export const E33 = defineEndpoint({
  code: 'E33',
  method: 'POST',
  path: '/admin/mentors/import',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E33QuerySchema,
  response: E33ResponseSchema,
  contentType: 'multipart/form-data',
});
