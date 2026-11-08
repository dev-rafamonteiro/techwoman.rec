import { z } from 'zod';
import { defineEndpoint, IdSchema, IsoDateTimeSchema } from './common.js';

/** Itens avaliados em E09, na ordem das telas. */
export const FEEDBACK_ITEMS = ['event', 'talk', 'mentoring'] as const;
export type FeedbackItem = (typeof FEEDBACK_ITEMS)[number];

const RatingsSchema = z.object({ event: z.number().int(), talk: z.number().int(), mentoring: z.number().int() });

export const AdminFeedbackItemSchema = z.object({
  menteeId: IdSchema,
  menteeName: z.string(),
  mentorName: z.string().nullable(),
  ratings: RatingsSchema,
  comment: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type AdminFeedbackItem = z.infer<typeof AdminFeedbackItemSchema>;

/** Média e quantas respostas deram cada nota (índice 0 = nota 1 … índice 4 = nota 5). */
const ItemSummarySchema = z.object({ average: z.number().nullable(), counts: z.array(z.number().int()).length(5) });

/**
 * E49 · GET /admin/feedback · A10 · admin/super_admin
 * Resultado da avaliação (E09): total de respostas, participantes com mentoria concluída (taxa de resposta), média e
 * distribuição das notas de cada item e todas as respostas, da mais recente para a mais antiga.
 */
export const E49ResponseSchema = z.object({
  total: z.number().int(),
  doneCount: z.number().int(),
  summary: z.object({ event: ItemSummarySchema, talk: ItemSummarySchema, mentoring: ItemSummarySchema }),
  items: z.array(AdminFeedbackItemSchema),
});
export type E49Response = z.infer<typeof E49ResponseSchema>;

export const E49 = defineEndpoint({
  code: 'E49',
  method: 'GET',
  path: '/admin/feedback',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E49ResponseSchema,
});
