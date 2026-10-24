import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  EmailSchema,
  LinkedinInputSchema,
  MENTEE_NOTE_MAX,
  PhoneInputSchema,
  PreferredPeriodSchema,
} from './common.js';

/** E02 · POST /public/mentees · P4 · Turnstile obrigatório · RN01, RN02 */
export const E02BodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    phone: PhoneInputSchema,
    linkedin: LinkedinInputSchema.optional(),
    area: AreaKeySchema,
    preferredPeriod: PreferredPeriodSchema,
    note: z.string().trim().max(MENTEE_NOTE_MAX).optional(),
    /** Resultado da gamificação (P2): pontuação por área. */
    quizScores: z.record(z.string().max(40), z.number().min(0).max(1000)).optional(),
    consent: z.object({ accepted: z.literal(true), version: z.string().min(1).max(40) }).strict(),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();
export type E02Body = z.infer<typeof E02BodySchema>;

/** 201: inscrição criada (ou reativada, RN01). Devolve o token para montar o link pessoal de P6. */
export const E02CreatedSchema = z.object({
  status: z.literal('created'),
  token: z.string(),
  personalPath: z.string().describe('/mentoria/minha?t=<token>'),
});
/** 200: e-mail já inscrito e ativo; o link foi reenviado por e-mail (sem token na resposta). */
export const E02AlreadyRegisteredSchema = z.object({
  status: z.literal('already_registered'),
  code: z.literal('ALREADY_REGISTERED'),
  message: z.string(),
});
export const E02ResponseSchema = z.union([E02CreatedSchema, E02AlreadyRegisteredSchema]);
export type E02Response = z.infer<typeof E02ResponseSchema>;

export const E02 = defineEndpoint({
  code: 'E02',
  method: 'POST',
  path: '/public/mentees',
  auth: 'public',
  turnstile: true,
  body: E02BodySchema,
  response: E02ResponseSchema,
});
