import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E49, E62, E63, E64, FEEDBACK_ITEMS, type E49Response, type RaffleDraw } from '@tw/shared';
import type { RaffleDrawDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { AppError, isDuplicateKey } from '../lib/errors.js';
import { respond, route } from '../lib/route.js';
import { iso } from '../lib/views.js';

const toDrawView = (d: RaffleDrawDoc): RaffleDraw => ({
  id: String(d._id), menteeId: String(d.menteeId), name: d.name, email: d.email, phone: d.phone, drawnAt: iso(d.drawnAt),
});

/** RN28 · quem concorre: respondeu a pesquisa (E09) e ainda não foi sorteada. */
async function raffleCandidates(ctx: AppContext, eventId: string): Promise<ObjectId[]> {
  const [answered, drawn] = await Promise.all([
    ctx.c.feedbacks.distinct('_id', { eventId }),
    ctx.c.raffleDraws.distinct('menteeId', { eventId }),
  ]);
  const out = new Set(drawn.map(String));
  return answered.filter((id) => !out.has(String(id)));
}

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

  // E62 · GET /admin/raffle · RN28: quantas concorrem e as sorteadas, da mais recente
  route(app, ctx, E62, async () => {
    const event = await loadEvent(ctx);
    const [candidates, draws] = await Promise.all([
      raffleCandidates(ctx, event._id),
      ctx.c.raffleDraws.find({ eventId: event._id }).sort({ drawnAt: -1, _id: -1 }).toArray(),
    ]);
    return { eligible: candidates.length, draws: draws.map(toDrawView) };
  });

  // E63 · POST /admin/raffle/draws · RN28: sorteia entre quem respondeu a pesquisa e ainda não saiu
  route(app, ctx, E63, async ({ req, user }) => {
    const event = await loadEvent(ctx);
    const actor = actorForRoute(req, 'admin');
    // duas administradoras sorteando juntas podem cair na mesma pessoa: o índice único barra e sorteia de novo
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = await raffleCandidates(ctx, event._id);
      if (candidates.length === 0) throw new AppError('INVALID_STATE', 'Ninguém para sortear: todas as que responderam a pesquisa já foram sorteadas.');
      const menteeId = candidates[randomInt(candidates.length)]!;
      try {
        const draw = await runTxn(ctx, async (session) => {
          const m = await ctx.c.mentees.findOne({ _id: menteeId }, { session, projection: { name: 1, email: 1, phone: 1 } });
          if (!m) return null;
          const doc: RaffleDrawDoc = { _id: new ObjectId(), eventId: event._id, menteeId, name: m.name, email: m.email, phone: m.phone ?? null, drawnAt: ctx.now(), drawnBy: user._id };
          await ctx.c.raffleDraws.insertOne(doc, { session });
          await writeAudit(ctx, session, { actor, action: 'raffle.draw', entity: 'mentee', entityId: menteeId, after: { summary: `Sorteada: ${m.name}` }, ip: req.ip });
          return doc;
        });
        if (!draw) continue; // inscrição apagada entre a lista e a leitura: sorteia de novo
        return respond(201, { draw: toDrawView(draw), eligible: candidates.length - 1 });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
      }
    }
    throw new AppError('CONFLICT', 'Outro sorteio aconteceu ao mesmo tempo. Tente de novo.');
  });

  // E64 · DELETE /admin/raffle/draws · RN28: limpa a lista; todas voltam a concorrer
  route(app, ctx, E64, async ({ req }) => {
    const event = await loadEvent(ctx);
    const actor = actorForRoute(req, 'admin');
    return runTxn(ctx, async (session) => {
      const { deletedCount } = await ctx.c.raffleDraws.deleteMany({ eventId: event._id }, { session });
      await writeAudit(ctx, session, { actor, action: 'raffle.clear', entity: 'event', entityId: event._id, after: { cleared: deletedCount, summary: `Lista de sorteadas limpa (${deletedCount})` }, ip: req.ip });
      return { ok: true as const, cleared: deletedCount };
    });
  });
}
