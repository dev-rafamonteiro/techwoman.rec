import { z } from 'zod';
import { defineEndpoint, IdSchema, SlotIdSchema, SlotSchema } from './common.js';
import { TableViewSchema } from './entities.js';

/** E23 · GET /mentor/options?menteeId=&slotId= · M5 · RN13 · chamado a cada troca de horário */
export const E23QuerySchema = z.object({ menteeId: IdSchema, slotId: SlotIdSchema.optional() }).strict();
export type E23Query = z.input<typeof E23QuerySchema>;

export const E23ResponseSchema = z.object({
  /** Horários futuros em que a mentora está disponível e livre; a mentora pode enviar convite de última hora. */
  slots: z.array(SlotSchema.extend({ preferred: z.boolean() })),
  /** Horário para o qual as mesas foram calculadas (o pedido, ou o preferido/primeiro livre). */
  selectedSlotId: SlotIdSchema.nullable(),
  tables: z.array(TableViewSchema.extend({ free: z.boolean() })),
  /** Mesa sugerida (RN13): a da mentoria anterior mais próxima se livre; senão a livre de menor número. */
  suggestedTableId: IdSchema.nullable(),
  /** Mesa em que a mentora estava no horário anterior (para a dica de M5). */
  previousTableId: IdSchema.nullable(),
});
export type E23Response = z.infer<typeof E23ResponseSchema>;

export const E23 = defineEndpoint({
  code: 'E23',
  method: 'GET',
  path: '/mentor/options',
  auth: 'staff',
  roles: ['mentor'],
  query: E23QuerySchema,
  response: E23ResponseSchema,
});
