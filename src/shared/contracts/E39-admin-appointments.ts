import { z } from 'zod';
import { defineEndpoint, IdParamsSchema, IdSchema, SlotIdSchema } from './common.js';
import { AdminAppointmentViewSchema } from './entities.js';

/** Avisos devolvidos quando o admin ignora regras do RN04. */
export const APPOINTMENT_WARNINGS = ['OUTSIDE_MENTOR_AVAILABILITY', 'LEAD_TIME_SHORT'] as const;
export const AppointmentWarningSchema = z.enum(APPOINTMENT_WARNINGS);

/** E39 · POST /admin/appointments · A4, A5 · criar em nome de uma mentora (RN04 com override) */
export const E39CreateBodySchema = z
  .object({
    menteeId: IdSchema,
    mentorId: IdSchema,
    slotId: SlotIdSchema,
    tableId: IdSchema,
    /** Admin pode ignorar disponibilidade e antecedência (com aviso na resposta). */
    ignoreAvailability: z.boolean().default(false),
    ignoreLeadTime: z.boolean().default(false),
  })
  .strict();
export type E39CreateBody = z.input<typeof E39CreateBodySchema>;

export const E39ResponseSchema = z.object({
  appointment: AdminAppointmentViewSchema,
  warnings: z.array(AppointmentWarningSchema),
});
export type E39Response = z.infer<typeof E39ResponseSchema>;

export const E39Create = defineEndpoint({
  code: 'E39',
  method: 'POST',
  path: '/admin/appointments',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  idempotent: true,
  body: E39CreateBodySchema,
  response: E39ResponseSchema,
});

/** E39 · PATCH /admin/appointments/:id · mover (cancela o antigo com motivo `moved` e cria `confirmed`), cancelar, no-show, confirmar */
export const E39PatchBodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('move'),
      slotId: SlotIdSchema,
      tableId: IdSchema,
      ignoreAvailability: z.boolean().default(false),
      ignoreLeadTime: z.boolean().default(false),
    })
    .strict(),
  /**
   * Troca a mentora (mesma mesa e horário), quando a original não aparece. `mentorNoShow` registra a falta dela na
   * auditoria. A antecedência mínima não vale (é na hora); a disponibilidade, só com `ignoreAvailability`.
   */
  z
    .object({
      action: z.literal('change_mentor'),
      mentorId: IdSchema,
      mentorNoShow: z.boolean().default(false),
      ignoreAvailability: z.boolean().default(false),
    })
    .strict(),
  /** `mentorNoShow`: a mentora não apareceu; a participante volta à fila com prioridade e a falta vai para a auditoria. */
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(200).optional(), mentorNoShow: z.boolean().default(false) }).strict(),
  /** Participante não compareceu (RN09): a equipe marca a qualquer hora; a mentora (E26), só 10 min após o início. */
  z.object({ action: z.literal('no_show') }).strict(),
  z.object({ action: z.literal('confirm_in_person') }).strict(),
  /** RN23 · só super admin; `reopen` de `done` ou `no_show`, `release` também de `in_progress`. */
  z.object({ action: z.literal('reopen') }).strict(),
  z.object({ action: z.literal('release') }).strict(),
]);
export type E39PatchBody = z.input<typeof E39PatchBodySchema>;

export const E39Patch = defineEndpoint({
  code: 'E39',
  method: 'PATCH',
  path: '/admin/appointments/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  idempotent: true,
  params: IdParamsSchema,
  body: E39PatchBodySchema,
  response: E39ResponseSchema,
});
