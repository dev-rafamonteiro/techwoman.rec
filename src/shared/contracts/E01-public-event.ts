import { z } from 'zod';
import { AreaSchema, defineEndpoint, PreferredPeriodSchema } from './common.js';

/** E01 · GET /public/event · P1, P4 */
export const E01ResponseSchema = z.object({
  name: z.string(),
  date: z.string(),
  location: z.string().nullable(),
  timezone: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  slotMinutes: z.number().int(),
  responseWindowMinutes: z.number().int(),
  registrationOpen: z.boolean(),
  areas: z.array(AreaSchema),
  /** Períodos preferidos com o rótulo e o intervalo (RN14), em horário de Recife. */
  periods: z.array(
    z.object({ key: PreferredPeriodSchema, label: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
  ),
  /** Versão do aviso de privacidade que deve ser gravada no consentimento (P4). */
  consentVersion: z.string(),
});
export type E01Response = z.infer<typeof E01ResponseSchema>;

export const E01 = defineEndpoint({
  code: 'E01',
  method: 'GET',
  path: '/public/event',
  auth: 'public',
  response: E01ResponseSchema,
});
