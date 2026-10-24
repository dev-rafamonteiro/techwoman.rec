import { z } from 'zod';
import {
  AreaKeySchema,
  defineEndpoint,
  IdParamsSchema,
  IsoDateTimeSchema,
  MenteeStatusSchema,
  OutboxChannelSchema,
  OutboxStatusSchema,
  OutboxTypeSchema,
  pageOf,
  PreferredPeriodSchema,
  QueryBoolSchema,
} from './common.js';
import { AppointmentHistoryEntrySchema, MenteeAdminViewSchema } from './entities.js';

/** Filtros compartilhados por E35 e E37. */
export const MenteeFiltersSchema = z.object({
  status: MenteeStatusSchema.optional(),
  area: AreaKeySchema.optional(),
  priority: QueryBoolSchema.optional(),
  period: PreferredPeriodSchema.optional(),
  q: z.string().trim().max(80).optional(),
});

/** E35 · GET /admin/mentees?status=&area=&priority=&q=&cursor= · A4 */
export const E35QuerySchema = MenteeFiltersSchema.extend({ cursor: z.string().max(500).optional() }).strict();
export type E35Query = z.input<typeof E35QuerySchema>;
export const E35ResponseSchema = pageOf(MenteeAdminViewSchema);
export type E35Response = z.infer<typeof E35ResponseSchema>;

export const E35 = defineEndpoint({
  code: 'E35',
  method: 'GET',
  path: '/admin/mentees',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  query: E35QuerySchema,
  response: E35ResponseSchema,
});

/** E35 (detalhe) · GET /admin/mentees/:id · A4 painel lateral: linha do tempo e notificações da participante */
export const E35DetailResponseSchema = z.object({
  mentee: MenteeAdminViewSchema,
  timeline: z.array(
    z.object({
      at: IsoDateTimeSchema,
      kind: z.string(),
      appointmentId: z.string().nullable(),
      entry: AppointmentHistoryEntrySchema.nullable(),
      label: z.string(),
    }),
  ),
  notifications: z.array(
    z.object({
      id: z.string(),
      type: OutboxTypeSchema,
      channel: OutboxChannelSchema,
      status: OutboxStatusSchema,
      attempts: z.number().int(),
      at: IsoDateTimeSchema,
    }),
  ),
});
export type E35DetailResponse = z.infer<typeof E35DetailResponseSchema>;

export const E35Detail = defineEndpoint({
  code: 'E35',
  method: 'GET',
  path: '/admin/mentees/:id',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  params: IdParamsSchema,
  response: E35DetailResponseSchema,
});
