import { z } from 'zod';
import { defineEndpoint, IsoDateTimeSchema, SlotSchema } from './common.js';
import { AdminAppointmentViewSchema, TableViewSchema } from './entities.js';

/** E38 · GET /admin/schedule · A5 · grade mesa × horário */
export const E38ResponseSchema = z.object({
  serverNow: IsoDateTimeSchema,
  timezone: z.string(),
  slots: z.array(SlotSchema),
  tables: z.array(TableViewSchema),
  /** Mentorias com slotLock (invited, confirmed, in_progress, done, no_show). Célula vazia = livre. */
  appointments: z.array(AdminAppointmentViewSchema),
});
export type E38Response = z.infer<typeof E38ResponseSchema>;

export const E38 = defineEndpoint({
  code: 'E38',
  method: 'GET',
  path: '/admin/schedule',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E38ResponseSchema,
});

/** E38 · GET /admin/stream (SSE) · A5 · eventos: ver sse.ts (AdminStreamEvent) */
export const E38Stream = defineEndpoint({
  code: 'E38',
  method: 'GET',
  path: '/admin/stream',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  contentType: 'text/event-stream',
});
