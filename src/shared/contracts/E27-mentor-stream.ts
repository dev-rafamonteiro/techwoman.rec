import { defineEndpoint } from './common.js';

/** E27 · GET /mentor/stream (SSE) · M4, M6 · eventos: ver sse.ts (queue.added, queue.removed, appointment.updated) */
export const E27 = defineEndpoint({
  code: 'E27',
  method: 'GET',
  path: '/mentor/stream',
  auth: 'staff',
  roles: ['mentor'],
  contentType: 'text/event-stream',
});
