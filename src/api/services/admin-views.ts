import type { AdminAppointmentView } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, TableDoc, UserDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { toAdminAppointmentView } from '../lib/views.js';

/** Monta as visões de admin de várias mentorias com poucas consultas (participante, mentora, mesa). */
export async function adminAppointmentViews(ctx: AppContext, event: EventDoc, appts: AppointmentDoc[]): Promise<AdminAppointmentView[]> {
  if (appts.length === 0) return [];
  const [mentees, mentors, tables] = await Promise.all([
    ctx.c.mentees.find({ _id: { $in: appts.map((a) => a.menteeId) } }).toArray(),
    ctx.c.users.find({ _id: { $in: appts.map((a) => a.mentorId) } }).toArray(),
    ctx.c.tables.find({ _id: { $in: appts.map((a) => a.tableId) } }).toArray(),
  ]);
  const mm = new Map<string, MenteeDoc>(mentees.map((m) => [String(m._id), m]));
  const uu = new Map<string, UserDoc>(mentors.map((u) => [String(u._id), u]));
  const tt = new Map<string, TableDoc>(tables.map((t) => [String(t._id), t]));
  const out: AdminAppointmentView[] = [];
  for (const a of appts) {
    const m = mm.get(String(a.menteeId));
    const u = uu.get(String(a.mentorId));
    const t = tt.get(String(a.tableId));
    if (m && u && t) out.push(toAdminAppointmentView(a, m, u, t, event));
  }
  return out;
}
