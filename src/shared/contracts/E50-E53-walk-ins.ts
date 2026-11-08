import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  EmailSchema,
  IdParamsSchema,
  IdSchema,
  IsoDateTimeSchema,
  MenteeStatusSchema,
  OkSchema,
  PhoneInputSchema,
  SearchQSchema,
} from './common.js';
import { MenteeStaffViewSchema } from './entities.js';

/** RN21 · nota livre da mentora sobre o atendimento fora da mesa. */
export const WALK_IN_NOTE_MAX = 500;
/** E50 · no máximo 20 participantes por busca. */
export const WALK_IN_SEARCH_LIMIT = 20;

/**
 * Situação da participante para a mentora decidir em M7 (o texto fica com a tela):
 * - `waiting`: "Na fila";
 * - `scheduled`: convite ou mentoria confirmada; `scheduled` traz horário, mesa e mentora (M7 avisa que o registro
 *   cancela essa mentoria);
 * - `done`: "Já atendida"; `no_show`: "Não compareceu";
 * - `walked_in_by_me`: a mentora já registrou atendimento fora da mesa com ela (E51 devolveria 409).
 */
export const WALK_IN_SITUATIONS = ['waiting', 'scheduled', 'done', 'no_show', 'walked_in_by_me'] as const;
export const WalkInSituationSchema = z.enum(WALK_IN_SITUATIONS);
export type WalkInSituation = z.infer<typeof WalkInSituationSchema>;

/** Atendimento fora da mesa visto pela mentora (E51, E52): participante sem contato. */
export const WalkInViewSchema = z.object({
  id: IdSchema,
  at: IsoDateTimeSchema,
  note: z.string().nullable(),
  mentee: MenteeStaffViewSchema,
});
export type WalkInView = z.infer<typeof WalkInViewSchema>;

/** Mentoria na mesa (convite ou confirmada) da participante: horário, mesa ("Mesa 7") e mentora. */
export const ScheduledTableSchema = z.object({
  appointmentId: IdSchema,
  startAt: IsoDateTimeSchema,
  tableLabel: z.string(),
  mentorName: z.string(),
});
export type ScheduledTable = z.infer<typeof ScheduledTableSchema>;

/** E50 · GET /mentor/mentees/search?q= · M7 · RN21 · busca tolerante a erro, todas as situações menos `cancelled`, sem contato */
export const E50QuerySchema = z.object({ q: SearchQSchema }).strict();
export type E50Query = z.input<typeof E50QuerySchema>;

export const E50ResponseSchema = z.object({
  items: z.array(
    z.object({
      mentee: MenteeStaffViewSchema,
      situation: WalkInSituationSchema,
      /** Início da mentoria agendada (`scheduled`); null nas outras situações. */
      startAt: IsoDateTimeSchema.nullable(),
      /** Mentoria na mesa que o registro vai cancelar (`scheduled`); null nas outras situações. */
      scheduled: ScheduledTableSchema.nullable(),
    }),
  ),
});
export type E50Response = z.infer<typeof E50ResponseSchema>;

export const E50 = defineEndpoint({
  code: 'E50',
  method: 'GET',
  path: '/mentor/mentees/search',
  auth: 'staff',
  roles: ['mentor'],
  query: E50QuerySchema,
  response: E50ResponseSchema,
});

/** Cadastro rápido feito pela mentora (sem Turnstile; a janela de inscrição RN02 não vale). */
export const WalkInNewMenteeSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    phone: PhoneInputSchema.optional(),
    area: AreaKeySchema,
  })
  .strict();
export type WalkInNewMentee = z.infer<typeof WalkInNewMenteeSchema>;

const note = z.string().trim().max(WALK_IN_NOTE_MAX).optional();

/**
 * E51 · POST /mentor/walk-ins · M7 · RN21 · aceita Idempotency-Key
 * Corpo: participante já inscrita (`menteeId`) ou cadastro rápido (`newMentee` + `consentAccepted: true`).
 * 409 CONFLICT se a mentora já registrou atendimento com a participante; 409 INVALID_STATE se ela está cancelada.
 * A participante sempre termina `done` (atendida) e fora da fila; convite ou mentoria confirmada na mesa é cancelada.
 */
export const E51BodySchema = z.union([
  z.object({ menteeId: IdSchema, note }).strict(),
  z.object({ newMentee: WalkInNewMenteeSchema, consentAccepted: z.literal(true), note }).strict(),
]);
export type E51Body = z.infer<typeof E51BodySchema>;

/**
 * 201. `outcome`: `existing` (escolhida pela busca), `created` (cadastro novo), `linked` (o e-mail do cadastro já
 * estava inscrito: o atendimento foi para a inscrição existente, RN01) ou `reactivated` (o e-mail era de uma inscrição
 * cancelada ou `no_show`, que volta como concluída). Em todos, ela recebe o e-mail `walk_in_done` (layout 10).
 */
export const E51ResponseSchema = z.object({
  walkIn: WalkInViewSchema,
  outcome: z.enum(['existing', 'created', 'linked', 'reactivated']),
  linkedExisting: z.boolean(),
  /** Nome da participante (no `linked`, o nome da inscrição que já existia). */
  name: z.string(),
  /** Status da participante antes e depois (sempre `done`: atendida e fora da fila). */
  previousStatus: MenteeStatusSchema.nullable(),
  status: MenteeStatusSchema,
  /** Mentoria na mesa cancelada por este registro (mesmo se a tela não sabia dela, numa corrida); null se não havia. */
  cancelledAppointment: ScheduledTableSchema.nullable(),
});
export type E51Response = z.infer<typeof E51ResponseSchema>;

export const E51 = defineEndpoint({
  code: 'E51',
  method: 'POST',
  path: '/mentor/walk-ins',
  auth: 'staff',
  roles: ['mentor'],
  idempotent: true,
  body: E51BodySchema,
  response: E51ResponseSchema,
});

/** E52 · GET /mentor/walk-ins · M6 · atendimentos fora da mesa da mentora no evento, do mais recente ao mais antigo */
export const E52ResponseSchema = z.object({ items: z.array(WalkInViewSchema) });
export type E52Response = z.infer<typeof E52ResponseSchema>;

export const E52 = defineEndpoint({
  code: 'E52',
  method: 'GET',
  path: '/mentor/walk-ins',
  auth: 'staff',
  roles: ['mentor'],
  response: E52ResponseSchema,
});

/** E53 · GET /admin/walk-ins?mentorId=&menteeId= · A4 · atendimentos fora da mesa ativos (sem os removidos), do mais recente */
export const E53ListQuerySchema = z.object({ mentorId: IdSchema.optional(), menteeId: IdSchema.optional() }).strict();
export type E53ListQuery = z.input<typeof E53ListQuerySchema>;

export const AdminWalkInViewSchema = z.object({
  id: IdSchema,
  at: IsoDateTimeSchema,
  note: z.string().nullable(),
  mentor: z.object({ id: IdSchema, name: z.string() }),
  mentee: z.object({ id: IdSchema, name: z.string(), email: z.string(), status: MenteeStatusSchema }),
  previousMenteeStatus: MenteeStatusSchema.nullable(),
});
export type AdminWalkInView = z.infer<typeof AdminWalkInViewSchema>;

export const E53ListResponseSchema = z.object({ items: z.array(AdminWalkInViewSchema) });
export type E53ListResponse = z.infer<typeof E53ListResponseSchema>;

export const E53List = defineEndpoint({
  code: 'E53',
  method: 'GET',
  path: '/admin/walk-ins',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E53ListQuerySchema,
  response: E53ListResponseSchema,
});

/**
 * E53 · DELETE /admin/walk-ins/:id · remoção lógica (`deletedAt`), auditada. Sem outro atendimento ativo e sem mentoria
 * na mesa ativa ou concluída, a participante é descadastrada (`cancelled`, fora dos números) e recebe o e-mail
 * `walk_in_removed` pedindo nova inscrição (`deregistered: true`).
 */
export const E53Delete = defineEndpoint({
  code: 'E53',
  method: 'DELETE',
  path: '/admin/walk-ins/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  response: OkSchema.extend({ deregistered: z.boolean() }),
});
