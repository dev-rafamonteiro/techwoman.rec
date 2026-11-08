import { z } from 'zod';
import { defineEndpoint } from './common.js';
import { E03ResponseSchema } from './E03-public-me.js';

/** Nota de 1 a 5 (evento, palestra, mentoria). */
export const FeedbackRatingSchema = z.number().int().min(1).max(5);
export const FEEDBACK_COMMENT_MAX = 1000;

/**
 * E09 · POST /public/me/feedback · P6 (Concluída)
 * Avaliação depois da mentoria concluída: notas de 1 a 5 para evento, palestra e mentoria, e comentário livre
 * opcional. Uma por participante, sem edição. Erros: INVALID_STATE (409) se a mentoria não está concluída ou se a
 * avaliação já foi enviada.
 */
export const E09BodySchema = z
  .object({
    event: FeedbackRatingSchema,
    talk: FeedbackRatingSchema,
    mentoring: FeedbackRatingSchema,
    comment: z.string().trim().max(FEEDBACK_COMMENT_MAX).optional(),
  })
  .strict();
export type E09Body = z.infer<typeof E09BodySchema>;

/** Devolve o estado atualizado (mesmo formato de E03): P6 troca o formulário pelo agradecimento. */
export const E09ResponseSchema = E03ResponseSchema;
export type E09Response = z.infer<typeof E09ResponseSchema>;

export const E09 = defineEndpoint({
  code: 'E09',
  method: 'POST',
  path: '/public/me/feedback',
  auth: 'mentee',
  body: E09BodySchema,
  response: E09ResponseSchema,
});
