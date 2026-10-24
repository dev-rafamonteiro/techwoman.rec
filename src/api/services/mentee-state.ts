import type { E03Response } from '@tw/shared';
import type { MenteeDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { loadEvent } from '../ctx.js';
import { iso, toMenteeAppointmentView } from '../lib/views.js';

const VISIBLE = new Set(['invited', 'confirmed', 'in_progress', 'done']);

/** Estado da página pessoal (P6): E03 e resposta de E04. */
export async function buildMenteeState(ctx: AppContext, mentee: MenteeDoc): Promise<E03Response> {
  const now = ctx.now();
  const event = await loadEvent(ctx);
  let appointment: E03Response['appointment'] = null;
  if (mentee.currentAppointmentId) {
    const a = await ctx.c.appointments.findOne({ _id: mentee.currentAppointmentId });
    if (a && VISIBLE.has(a.status)) {
      const [mentor, table] = await Promise.all([ctx.c.users.findOne({ _id: a.mentorId }), ctx.c.tables.findOne({ _id: a.tableId })]);
      if (mentor && table) appointment = toMenteeAppointmentView(a, mentor, table, event, now);
    }
  }
  return {
    mentee: {
      name: mentee.name,
      area: mentee.area,
      preferredPeriod: mentee.preferredPeriod,
      status: mentee.status,
      priority: mentee.priority,
      createdAt: iso(mentee.createdAt),
    },
    appointment,
    lastOutcome: mentee.status === 'waiting' ? mentee.lastOutcome : null,
    event: { registrationOpen: event.registrationOpen, timezone: event.timezone },
    serverNow: iso(now),
  };
}
