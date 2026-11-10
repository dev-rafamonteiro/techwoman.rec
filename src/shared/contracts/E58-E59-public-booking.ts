import { z } from 'zod';
import { AreaKeySchema, defineEndpoint, IsoDateTimeSchema, SlotIdSchema } from './common.js';
import { PublicMentorSchema } from './E54-public-mentors.js';

const AreaQuerySchema = z.object({ area: AreaKeySchema });

/**
 * E58 · GET /public/slots?area= · P4 · público · RN24
 * Horários futuros da trilha com mentora e mesa livres. `available` = min(mentoras livres da trilha, mesas livres) no
 * horário: é a visão geral; a mentora específica só é conferida em E59 e na gravação (E02).
 */
export const E58ItemSchema = z.object({
  slotId: SlotIdSchema,
  startAt: IsoDateTimeSchema,
  endAt: IsoDateTimeSchema,
  period: z.enum(['morning', 'early_afternoon', 'late_afternoon']),
  available: z.number().int().positive(),
});
export type E58Item = z.infer<typeof E58ItemSchema>;
export const E58ResponseSchema = z.object({ items: z.array(E58ItemSchema) });
export type E58Response = z.infer<typeof E58ResponseSchema>;

export const E58 = defineEndpoint({
  code: 'E58',
  method: 'GET',
  path: '/public/slots',
  auth: 'public',
  query: AreaQuerySchema,
  response: E58ResponseSchema,
});

export const E59ParamsSchema = z.object({ slotId: SlotIdSchema });

/** Só o que P4 mostra da mentora; os campos saem normalizados como em E54. */
export const SlotMentorSchema = PublicMentorSchema.pick({ id: true, name: true, photoUrl: true, bio: true, linkedin: true });
export type SlotMentor = z.infer<typeof SlotMentorSchema>;

/**
 * E59 · GET /public/slots/:slotId/mentors?area= · P4 · público · RN24
 * Amostra aleatória de até 5 mentoras da trilha livres no horário. Sem cache: cada resposta é outra amostra.
 */
export const E59ResponseSchema = z.object({ items: z.array(SlotMentorSchema) });
export type E59Response = z.infer<typeof E59ResponseSchema>;

export const E59 = defineEndpoint({
  code: 'E59',
  method: 'GET',
  path: '/public/slots/:slotId/mentors',
  auth: 'public',
  params: E59ParamsSchema,
  query: AreaQuerySchema,
  response: E59ResponseSchema,
});
