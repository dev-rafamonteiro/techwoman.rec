import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  IsoDateTimeSchema,
  MenteeStatusSchema,
  PreferredPeriodSchema,
} from './common.js';
import { MenteeAppointmentViewSchema } from './entities.js';

/** Último desfecho da fila, para P6 mostrar "Recusada por horário" / "Proposta expirada" enquanto `waiting`. */
export const LAST_OUTCOMES = ['declined_schedule', 'expired', 'cancelled_by_staff'] as const;
export const LastOutcomeSchema = z.enum(LAST_OUTCOMES);

/** E03 · GET /public/me (header X-Mentee-Token) · P6 */
export const E03ResponseSchema = z.object({
  mentee: z.object({
    name: z.string(),
    area: AreaKeySchema,
    preferredPeriod: PreferredPeriodSchema,
    status: MenteeStatusSchema,
    priority: z.boolean(),
    createdAt: IsoDateTimeSchema,
  }),
  /** Convite ativo ou mentoria confirmada/concluída; null quando não há. */
  appointment: MenteeAppointmentViewSchema.nullable(),
  lastOutcome: LastOutcomeSchema.nullable(),
  /** Avaliação enviada em E09 (só com status `done`); null quando ainda não enviou. */
  feedback: z
    .object({
      ratings: z.object({ event: z.number().int(), talk: z.number().int(), mentoring: z.number().int() }),
      comment: z.string().nullable(),
      createdAt: IsoDateTimeSchema,
    })
    .nullable(),
  /**
   * Atendimento fora da mesa (RN21) mais recente com ela; P6 mostra "Você fez uma mentoria com {mentora}" quando ela
   * foi concluída assim (sem `appointment`). null quando não há.
   */
  walkIn: z.object({ mentorName: z.string(), at: IsoDateTimeSchema }).nullable(),
  event: z.object({ registrationOpen: z.boolean(), timezone: z.string() }),
  /** Hora do servidor, para o contador regressivo não depender do relógio do celular. */
  serverNow: IsoDateTimeSchema,
});
export type E03Response = z.infer<typeof E03ResponseSchema>;

export const E03 = defineEndpoint({
  code: 'E03',
  method: 'GET',
  path: '/public/me',
  auth: 'mentee',
  response: E03ResponseSchema,
});
