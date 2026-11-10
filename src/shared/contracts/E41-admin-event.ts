import { z } from 'zod';
import { AreaSchema, defineEndpoint } from './common.js';
import { EventConfigSchema } from './entities.js';

/** E41 · GET /admin/event · A7 · super admin */
export const E41GetResponseSchema = z.object({ event: EventConfigSchema });
export type E41GetResponse = z.infer<typeof E41GetResponseSchema>;

/**
 * E41 · PUT /admin/event · A7 · RN16 (GRID_LOCKED se mexer em horários/duração/intervalo com mentoria ativa).
 * `version` é o da leitura (concorrência otimista; CONFLICT se mudou). `slots` é recalculado no servidor.
 * `whatsappLists` (menus do WhatsApp, removidos em 2026-11-05) ainda é aceito para uma aba antiga do A7 não levar 422,
 * mas é ignorado.
 */
export const E41PutBodySchema = EventConfigSchema.omit({ id: true, slots: true })
  // turnstileEnabled opcional: uma aba do A7 aberta antes do campo existir salva sem 422 (e não mexe nele)
  .extend({ areas: z.array(AreaSchema).min(1).max(30), turnstileEnabled: z.boolean().optional(), whatsappLists: z.unknown().optional() })
  .strict();
export type E41PutBody = z.input<typeof E41PutBodySchema>;
export const E41PutResponseSchema = E41GetResponseSchema;

export const E41Get = defineEndpoint({
  code: 'E41',
  method: 'GET',
  path: '/admin/event',
  auth: 'staff',
  roles: ['super_admin'],
  response: E41GetResponseSchema,
});

export const E41Put = defineEndpoint({
  code: 'E41',
  method: 'PUT',
  path: '/admin/event',
  auth: 'staff',
  roles: ['super_admin'],
  body: E41PutBodySchema,
  response: E41PutResponseSchema,
});
