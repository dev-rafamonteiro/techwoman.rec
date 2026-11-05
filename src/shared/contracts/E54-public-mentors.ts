import { z } from 'zod';
import { defineEndpoint, IdSchema } from './common.js';

/**
 * Perfil público da mentora (P7): só o que ela mostra para quem visita o site.
 * Nunca e-mail, telefone, disponibilidade, horários marcados nem dados de login.
 */
export const PublicMentorSchema = z.object({
  id: IdSchema,
  name: z.string(),
  /** Caminho no próprio site (`/mentoras/...`) ou URL https; null = a tela mostra as iniciais. */
  photoUrl: z.string().nullable(),
  organization: z.string().nullable(),
  /** Áreas com o rótulo do evento (área sem rótulo no evento vem com o rótulo = chave). */
  areas: z.array(z.object({ key: z.string(), label: z.string() })),
  themes: z.array(z.string()),
  bio: z.string().nullable(),
  /** Sempre `https://www.linkedin.com/in/<perfil>` normalizado; null se não houver ou se o valor guardado for inválido. */
  linkedin: z.string().url().startsWith('https://').nullable(),
});
export type PublicMentor = z.infer<typeof PublicMentorSchema>;

/**
 * E54 · GET /public/mentors · P7 · público, sem login e sem CSRF; `Cache-Control: public, max-age=60`.
 * Mentoras ativas em ordem de nome; `stats.availableSlots` = vagas que ainda restam nos horários futuros
 * (soma de max(0, min(mesas ativas, mentoras disponíveis) - mentorias marcadas), a mesma conta do E30).
 */
export const E54ResponseSchema = z.object({
  items: z.array(PublicMentorSchema),
  stats: z.object({
    mentorCount: z.number().int().nonnegative(),
    slotMinutes: z.number().int().positive(),
    availableSlots: z.number().int().nonnegative(),
  }),
});
export type E54Response = z.infer<typeof E54ResponseSchema>;

export const E54 = defineEndpoint({
  code: 'E54',
  method: 'GET',
  path: '/public/mentors',
  auth: 'public',
  response: E54ResponseSchema,
});
