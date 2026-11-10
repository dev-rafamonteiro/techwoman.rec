import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  EmailSchema,
  IdSchema,
  IsoDateTimeSchema,
  LinkedinInputSchema,
  MENTEE_NOTE_MAX,
  MENTOR_THEME_MAX,
  PhoneInputSchema,
  SlotIdSchema,
} from './common.js';

/** E02 · POST /public/mentees · P4 · Turnstile obrigatório · RN01, RN02, RN24 */
export const E02BodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    phone: PhoneInputSchema,
    linkedin: LinkedinInputSchema.optional(),
    area: AreaKeySchema,
    /** Tema dentro da trilha (`area`), do catálogo em trilhas.ts. */
    theme: z.string().trim().min(1).max(MENTOR_THEME_MAX).optional(),
    /** Horário e mentora escolhidos em P4 (E58, E59); a mesa é automática (RN24). */
    slotId: SlotIdSchema,
    mentorId: IdSchema,
    note: z.string().trim().max(MENTEE_NOTE_MAX).optional(),
    /** Resultado da gamificação (P2): pontuação por área. */
    quizScores: z.record(z.string().max(40), z.number().min(0).max(1000)).optional(),
    consent: z.object({ accepted: z.literal(true), version: z.string().min(1).max(40) }).strict(),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();
export type E02Body = z.infer<typeof E02BodySchema>;

/** 201: inscrição criada (ou reativada, RN01) já com a mentoria confirmada (RN24). Devolve o token, o caminho de P6 e o link curto (E48). */
export const E02CreatedSchema = z.object({
  status: z.literal('created'),
  token: z.string(),
  personalPath: z.string().describe('/mentoria/minha?t=<token>'),
  /** Link curto de P6 (E48, `kind = personal`): o que P5 mostra e copia. */
  shortPath: z.string().describe('/l/<código>'),
  appointment: z.object({ mentorName: z.string(), tableLabel: z.string(), startAt: IsoDateTimeSchema, endAt: IsoDateTimeSchema }),
});
export type E02Created = z.infer<typeof E02CreatedSchema>;
/** 200: e-mail ou celular de uma inscrição ativa do evento (RN01); nada é gravado nem enviado. */
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
