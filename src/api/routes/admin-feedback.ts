import type { FastifyInstance } from 'fastify';
import { E49, FEEDBACK_ITEMS, type E49Response } from '@tw/shared';
import { loadEvent, type AppContext } from '../ctx.js';
import { route } from '../lib/route.js';
import { iso } from '../lib/views.js';

export function registerAdminFeedbackRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E49 · GET /admin/feedback · resultado da avaliação (E09)
  route(app, ctx, E49, async () => {
    const event = await loadEvent(ctx);
    const eid = event._id;
    const [docs, doneCount] = await Promise.all([
      ctx.c.feedbacks.find({ eventId: eid }).sort({ createdAt: -1, _id: -1 }).toArray(),
      ctx.c.mentees.countDocuments({ eventId: eid, status: 'done' }),
    ]);
    const [mentees, appts] = await Promise.all([
      ctx.c.mentees.find({ _id: { $in: docs.map((d) => d._id) } }, { projection: { name: 1 } }).toArray(),
      ctx.c.appointments.find({ _id: { $in: docs.flatMap((d) => (d.appointmentId ? [d.appointmentId] : [])) } }, { projection: { mentorId: 1 } }).toArray(),
    ]);
    // `mentorId` na avaliação (atendimento fora da mesa, RN21, e avaliações novas); nas antigas, a da mentoria
    const mentorIds = [...appts.map((a) => a.mentorId), ...docs.flatMap((d) => (d.mentorId ? [d.mentorId] : []))];
    const mentors = await ctx.c.users.find({ _id: { $in: mentorIds } }, { projection: { name: 1 } }).toArray();
    const menteeName = new Map(mentees.map((m) => [String(m._id), m.name]));
    const userName = new Map(mentors.map((u) => [String(u._id), u.name]));
    const apptMentor = new Map(appts.map((a) => [String(a._id), String(a.mentorId)]));
    const mentorNameOf = (d: (typeof docs)[number]): string | null => {
      const mid = d.mentorId ? String(d.mentorId) : d.appointmentId ? apptMentor.get(String(d.appointmentId)) : undefined;
      return mid ? (userName.get(mid) ?? null) : null;
    };

    const summary = Object.fromEntries(
      FEEDBACK_ITEMS.map((k) => {
        const counts = [0, 0, 0, 0, 0];
        for (const d of docs) counts[d.ratings[k] - 1]! += 1;
        // média com uma casa decimal; null sem respostas
        const average = docs.length ? Math.round((docs.reduce((s, d) => s + d.ratings[k], 0) / docs.length) * 10) / 10 : null;
        return [k, { average, counts }];
      }),
    ) as E49Response['summary'];

    const body: E49Response = {
      total: docs.length,
      doneCount,
      summary,
      items: docs.map((d) => ({
        menteeId: String(d._id),
        menteeName: menteeName.get(String(d._id)) ?? 'Participante',
        mentorName: mentorNameOf(d),
        ratings: d.ratings,
        comment: d.comment,
        createdAt: iso(d.createdAt),
      })),
    };
    return body;
  });
}
