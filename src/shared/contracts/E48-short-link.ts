import { z } from 'zod';
import { defineEndpoint } from './common.js';

/**
 * Código do link curto. Aceita qualquer texto de até 64 caracteres; o que não vale vira '' (sem 422), para a resposta
 * de um código inválido ser igual à de um inexistente ou revogado (sem enumeração).
 */
export const E48ParamsSchema = z.object({ code: z.string().max(64).catch('') }).strict();
export type E48Params = z.input<typeof E48ParamsSchema>;

/**
 * E48 · GET /l/:code · e-mails, WhatsApp, P5 · link curto `<PUBLIC_BASE_URL>/l/<código>`
 * Rota da API `/api/l/:code` (Nginx e Vite reescrevem `/l/` para ela). Público, sem CSRF, não executa ação.
 * Sempre 302 sem corpo com `Location` relativo: `personal` → `/mentoria/minha?t=<token>`, `calendar` →
 * `/api/public/calendar.ics?t=<token>`; inexistente, inválido, revogado ou sem participante → `/mentoria/minha`.
 */
export const E48 = defineEndpoint({
  code: 'E48',
  method: 'GET',
  path: '/l/:code',
  auth: 'public',
  params: E48ParamsSchema,
});
