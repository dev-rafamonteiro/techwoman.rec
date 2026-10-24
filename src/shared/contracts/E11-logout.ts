import { defineEndpoint, OkSchema } from './common.js';

/** E11 · POST /auth/logout · todas as telas autenticadas · revoga a sessão */
export const E11 = defineEndpoint({
  code: 'E11',
  method: 'POST',
  path: '/auth/logout',
  auth: 'staff',
  response: OkSchema,
});
