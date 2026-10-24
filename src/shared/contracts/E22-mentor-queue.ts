import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  pageOf,
  PreferredPeriodSchema,
  QueryBoolSchema,
} from './common.js';
import { MenteeStaffViewSchema } from './entities.js';

/** E22 · GET /mentor/queue?area=&period=&priority=&q=&cursor= · M4 · RN03 · 30 itens por página, sem contato */
export const E22QuerySchema = z
  .object({
    /** Lista separada por vírgula (multi-seleção). Ausente = todas as áreas. */
    area: z
      .string()
      .max(400)
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(AreaKeySchema))
      .optional(),
    period: PreferredPeriodSchema.optional(),
    priority: QueryBoolSchema.optional(),
    q: z.string().trim().max(80).optional(),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export type E22Query = z.input<typeof E22QuerySchema>;

export const E22ResponseSchema = pageOf(MenteeStaffViewSchema).extend({
  /** Horários livres da mentora hoje (cabeçalho de M4). */
  freeSlots: z.number().int(),
  /** Mentora sem nenhum horário disponível (aviso de M3). */
  hasAvailability: z.boolean(),
});
export type E22Response = z.infer<typeof E22ResponseSchema>;

export const E22 = defineEndpoint({
  code: 'E22',
  method: 'GET',
  path: '/mentor/queue',
  auth: 'staff',
  roles: ['mentor'],
  query: E22QuerySchema,
  response: E22ResponseSchema,
});
