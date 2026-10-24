import { defineEndpoint } from './common.js';

/** E42 · GET /admin/event/qrcode.png · A7 · QR Code da página de inscrição (/mentoria/inscricao) */
export const E42Png = defineEndpoint({
  code: 'E42',
  method: 'GET',
  path: '/admin/event/qrcode.png',
  auth: 'staff',
  roles: ['super_admin'],
  contentType: 'image/png',
});

/** E42 · GET /admin/event/qrcode.svg */
export const E42Svg = defineEndpoint({
  code: 'E42',
  method: 'GET',
  path: '/admin/event/qrcode.svg',
  auth: 'staff',
  roles: ['super_admin'],
  contentType: 'image/svg+xml',
});
