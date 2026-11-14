import { z } from 'zod';
import { defineEndpoint, IdSchema, IsoDateTimeSchema, OkSchema } from './common.js';

/** Sorteada (RN28): dados da participante no momento do sorteio. */
export const RaffleDrawSchema = z.object({
  id: IdSchema,
  menteeId: IdSchema,
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  drawnAt: IsoDateTimeSchema,
});
export type RaffleDraw = z.infer<typeof RaffleDrawSchema>;

/**
 * E62 · GET /admin/raffle · A10 · sorteio entre quem respondeu a pesquisa (RN28): quantas ainda concorrem
 * (`eligible`, respostas de E09 menos as já sorteadas) e as sorteadas, da mais recente para a mais antiga.
 */
export const E62ResponseSchema = z.object({ eligible: z.number().int(), draws: z.array(RaffleDrawSchema) });
export type E62Response = z.infer<typeof E62ResponseSchema>;

export const E62 = defineEndpoint({
  code: 'E62',
  method: 'GET',
  path: '/admin/raffle',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E62ResponseSchema,
});

/**
 * E63 · POST /admin/raffle/draws · A10 · sorteia uma participante entre as que responderam a pesquisa e ainda não foram
 * sorteadas, grava (`raffle_draws`) e devolve 201 com ela e quantas ainda concorrem. Ninguém para sortear: 409
 * `INVALID_STATE`. Auditoria `raffle.draw`.
 */
export const E63BodySchema = z.object({}).strict();
export type E63Body = z.input<typeof E63BodySchema>;
export const E63ResponseSchema = z.object({ draw: RaffleDrawSchema, eligible: z.number().int() });
export type E63Response = z.infer<typeof E63ResponseSchema>;

export const E63 = defineEndpoint({
  code: 'E63',
  method: 'POST',
  path: '/admin/raffle/draws',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  body: E63BodySchema,
  response: E63ResponseSchema,
});

/** E64 · DELETE /admin/raffle/draws · A10 · limpa a lista de sorteadas: todas voltam a concorrer. Auditoria `raffle.clear`. */
export const E64ResponseSchema = OkSchema.extend({ cleared: z.number().int() });
export type E64Response = z.infer<typeof E64ResponseSchema>;

export const E64 = defineEndpoint({
  code: 'E64',
  method: 'DELETE',
  path: '/admin/raffle/draws',
  auth: 'staff',
  roles: ['admin', 'super_admin'],
  response: E64ResponseSchema,
});
