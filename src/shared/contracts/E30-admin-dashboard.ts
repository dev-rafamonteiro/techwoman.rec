import { z } from 'zod';
import { AreaKeySchema, defineEndpoint, IdSchema, IsoDateTimeSchema } from './common.js';

/** E30 · GET /admin/dashboard · A1 · atualização a cada 15 s */
export const AttentionItemSchema = z.object({
  kind: z.enum(['invite_expiring', 'table_late', 'priority_waiting']),
  appointmentId: IdSchema.nullable(),
  menteeId: IdSchema.nullable(),
  menteeName: z.string(),
  mentorName: z.string().nullable(),
  tableNumber: z.number().int().nullable(),
  /** Prazo do convite (invite_expiring), início previsto (table_late) ou entrada na fila (priority_waiting). */
  at: IsoDateTimeSchema,
});

export const E30ResponseSchema = z.object({
  serverNow: IsoDateTimeSchema,
  counts: z.object({
    registered: z.number().int(),
    waiting: z.number().int(),
    invitesPending: z.number().int(),
    confirmed: z.number().int(),
    done: z.number().int(),
    noShow: z.number().int(),
  }),
  tables: z.object({ occupiedNow: z.number().int(), total: z.number().int() }),
  /** Sessões livres restantes no dia (capacidade). */
  remainingCapacity: z.number().int(),
  mentors: z.object({ loggedIn: z.number().int(), total: z.number().int() }),
  registeredByArea: z.array(z.object({ area: AreaKeySchema, label: z.string(), count: z.number().int() })),
  registeredByHour: z.array(z.object({ hour: IsoDateTimeSchema, count: z.number().int() })),
  attention: z.array(AttentionItemSchema),
});
export type E30Response = z.infer<typeof E30ResponseSchema>;

export const E30 = defineEndpoint({
  code: 'E30',
  method: 'GET',
  path: '/admin/dashboard',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E30ResponseSchema,
});
