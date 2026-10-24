export * from './time.js';
export * from './contracts/common.js';
export * from './contracts/entities.js';
export * from './contracts/sse.js';
export * from './contracts/E01-public-event.js';
export * from './contracts/E02-create-mentee.js';
export * from './contracts/E03-public-me.js';
export * from './contracts/E04-mentee-actions.js';
export * from './contracts/E05-resend-link.js';
export * from './contracts/E06-public-calendar.js';
export * from './contracts/E10-login.js';
export * from './contracts/E11-logout.js';
export * from './contracts/E12-me.js';
export * from './contracts/E13-change-password.js';
export * from './contracts/E20-mentor-availability-get.js';
export * from './contracts/E21-mentor-availability-put.js';
export * from './contracts/E22-mentor-queue.js';
export * from './contracts/E23-mentor-options.js';
export * from './contracts/E24-create-appointment.js';
export * from './contracts/E25-mentor-agenda.js';
export * from './contracts/E26-mentor-appointment-action.js';
export * from './contracts/E27-mentor-stream.js';
export * from './contracts/E28-mentor-profile.js';
export * from './contracts/E30-admin-dashboard.js';
export * from './contracts/E31-admin-mentors.js';
export * from './contracts/E32-admin-mentor-patch.js';
export * from './contracts/E33-admin-mentors-import.js';
export * from './contracts/E34-admin-reset-password.js';
export * from './contracts/E35-admin-mentees.js';
export * from './contracts/E36-admin-mentee-patch.js';
export * from './contracts/E37-admin-mentees-export.js';
export * from './contracts/E38-admin-schedule.js';
export * from './contracts/E39-admin-appointments.js';
export * from './contracts/E40-admin-tables.js';
export * from './contracts/E41-admin-event.js';
export * from './contracts/E42-admin-event-qrcode.js';
export * from './contracts/E43-admin-users.js';
export * from './contracts/E44-admin-notifications.js';
export * from './contracts/E45-admin-audit.js';
export * from './contracts/E46-admin-email-preview.js';

import type { EndpointDef } from './contracts/common.js';
import { E01 } from './contracts/E01-public-event.js';
import { E02 } from './contracts/E02-create-mentee.js';
import { E03 } from './contracts/E03-public-me.js';
import { E04 } from './contracts/E04-mentee-actions.js';
import { E05 } from './contracts/E05-resend-link.js';
import { E06 } from './contracts/E06-public-calendar.js';
import { E10 } from './contracts/E10-login.js';
import { E11 } from './contracts/E11-logout.js';
import { E12 } from './contracts/E12-me.js';
import { E13 } from './contracts/E13-change-password.js';
import { E20 } from './contracts/E20-mentor-availability-get.js';
import { E21 } from './contracts/E21-mentor-availability-put.js';
import { E22 } from './contracts/E22-mentor-queue.js';
import { E23 } from './contracts/E23-mentor-options.js';
import { E24 } from './contracts/E24-create-appointment.js';
import { E25 } from './contracts/E25-mentor-agenda.js';
import { E26 } from './contracts/E26-mentor-appointment-action.js';
import { E27 } from './contracts/E27-mentor-stream.js';
import { E28 } from './contracts/E28-mentor-profile.js';
import { E30 } from './contracts/E30-admin-dashboard.js';
import { E31Create, E31List } from './contracts/E31-admin-mentors.js';
import { E32 } from './contracts/E32-admin-mentor-patch.js';
import { E33 } from './contracts/E33-admin-mentors-import.js';
import { E34 } from './contracts/E34-admin-reset-password.js';
import { E35, E35Detail } from './contracts/E35-admin-mentees.js';
import { E36 } from './contracts/E36-admin-mentee-patch.js';
import { E37 } from './contracts/E37-admin-mentees-export.js';
import { E38, E38Stream } from './contracts/E38-admin-schedule.js';
import { E39Create, E39Patch } from './contracts/E39-admin-appointments.js';
import { E40Get, E40Put } from './contracts/E40-admin-tables.js';
import { E41Get, E41Put } from './contracts/E41-admin-event.js';
import { E42Png, E42Svg } from './contracts/E42-admin-event-qrcode.js';
import { E43Create, E43List, E43Patch } from './contracts/E43-admin-users.js';
import { E44List, E44Retry } from './contracts/E44-admin-notifications.js';
import { E45 } from './contracts/E45-admin-audit.js';
import { E46 } from './contracts/E46-admin-email-preview.js';

/** Todos os endpoints, por nome. Usado pelo cliente HTTP tipado e pelo registro de rotas da API. */
export const ENDPOINTS = {
  E01, E02, E03, E04, E05, E06,
  E10, E11, E12, E13,
  E20, E21, E22, E23, E24, E25, E26, E27, E28,
  E30, E31List, E31Create, E32, E33, E34, E35, E35Detail, E36, E37, E38, E38Stream,
  E39Create, E39Patch, E40Get, E40Put, E41Get, E41Put, E42Png, E42Svg,
  E43List, E43Create, E43Patch, E44List, E44Retry, E45, E46,
} as const;

export type EndpointName = keyof typeof ENDPOINTS;
export const ENDPOINT_LIST: readonly EndpointDef[] = Object.values(ENDPOINTS);
