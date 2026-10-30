import { z } from 'zod';
import { defineEndpoint, EmailSchema, IdSchema, RoleSchema } from './common.js';

/** Usuário logado (E10, E12). */
export const SessionUserSchema = z.object({
  id: IdSchema,
  name: z.string(),
  email: z.string(),
  roles: z.array(RoleSchema),
  mustChangePassword: z.boolean(),
  /** Rota sugerida pelo perfil: mentora → /mentora/aguardando; admin → /admin. */
  homePath: z.string(),
  /** Perfil atual (M2 confere; M4 usa `areas` no filtro padrão). */
  linkedin: z.string().nullable(),
  /** WhatsApp da própria mentora (E.164), para os avisos `mentor_slot_released`. */
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  areas: z.array(z.string()),
  themes: z.array(z.string()),
  bio: z.string().nullable(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** E10 · POST /auth/login · M1 · bloqueio de 5 min após 5 falhas em 10 min */
export const E10BodySchema = z.object({ email: EmailSchema, password: z.string().min(1).max(128) }).strict();
export type E10Body = z.infer<typeof E10BodySchema>;
export const E10ResponseSchema = z.object({ user: SessionUserSchema });
export type E10Response = z.infer<typeof E10ResponseSchema>;

export const E10 = defineEndpoint({
  code: 'E10',
  method: 'POST',
  path: '/auth/login',
  auth: 'public',
  body: E10BodySchema,
  response: E10ResponseSchema,
});
