import { z } from 'zod';
import { defineEndpoint, IdSchema } from './common.js';
import { TableViewSchema } from './entities.js';

/** E40 · GET /admin/tables · A6 · super admin */
export const E40GetResponseSchema = z.object({ tables: z.array(TableViewSchema) });
export type E40GetResponse = z.infer<typeof E40GetResponseSchema>;

/** E40 · PUT /admin/tables · substitui a lista. `id` ausente = mesa nova. Mesa omitida = removida (só sem mentorias). */
export const E40PutBodySchema = z
  .object({
    tables: z
      .array(
        z
          .object({
            id: IdSchema.optional(),
            number: z.number().int().min(1).max(500),
            name: z.string().trim().max(60).nullable().optional(),
            location: z.string().trim().max(80).nullable().optional(),
            active: z.boolean().default(true),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type E40PutBody = z.input<typeof E40PutBodySchema>;
export const E40PutResponseSchema = E40GetResponseSchema;

/** `details` do erro TABLE_IN_USE: mentorias futuras a realocar antes de desativar/remover a mesa. */
export const TableInUseDetailsSchema = z.object({
  appointments: z.array(
    z.object({ id: z.string(), tableNumber: z.number().int(), startAt: z.string(), mentorName: z.string(), menteeName: z.string() }),
  ),
});

export const E40Get = defineEndpoint({
  code: 'E40',
  method: 'GET',
  path: '/admin/tables',
  auth: 'staff',
  roles: ['super_admin'],
  response: E40GetResponseSchema,
});

export const E40Put = defineEndpoint({
  code: 'E40',
  method: 'PUT',
  path: '/admin/tables',
  auth: 'staff',
  roles: ['super_admin'],
  body: E40PutBodySchema,
  response: E40PutResponseSchema,
});
