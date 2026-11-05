import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E50, E51, E52, E53Delete, E53List, MENTEE_STATUSES, WALK_IN_SEARCH_LIMIT, type E50Response, type E53ListResponse } from '@tw/shared';
import type { MenteeDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { respond, route } from '../lib/route.js';
import { iso, toMenteeStaffView } from '../lib/views.js';
import { menteeSearchPipeline, runSearch } from '../search/text.js';
import { createWalkIn, toWalkInView } from '../services/walk-in.js';
import { shouldRestoreToQueue, walkInSituation } from '../domain/index.js';

/** E50 procura em todas as situações menos `cancelled` (RN21). */
const SEARCHABLE = MENTEE_STATUSES.filter((s) => s !== 'cancelled');
/** Mentorias na mesa que ainda a prendem; `no_show` antigo não conta (RN01: ela pode ter voltado à fila depois). */
const ACTIVE_OR_DONE = ['invited', 'confirmed', 'in_progress', 'done'] as const;

/** RN21 · atendimento fora da mesa: E50–E52 (mentora) e E53 (admin). */
export function registerWalkInRoutes(app: FastifyInstance, ctx: AppContext): void {
  const oid = (s: string) => {
    if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    return new ObjectId(s);
  };

  // E50 · GET /mentor/mentees/search?q= · Atlas Search tolerante a erro, sem contato
  route(app, ctx, E50, async ({ user, query }) => {
    const event = await loadEvent(ctx);
    const found = await runSearch<MenteeDoc>(
      ctx,
      ctx.c.mentees,
      menteeSearchPipeline({ q: query.q, eventId: event._id, statusIn: [...SEARCHABLE], limit: WALK_IN_SEARCH_LIMIT }),
      'E50',
    );
    const ids = found.map((m) => m._id);
    // a projeção da busca não traz `currentAppointmentId`: a mentoria marcada vem pela participante
    const [appts, mine] = await Promise.all([
      ctx.c.appointments.find({ eventId: event._id, menteeId: { $in: ids }, menteeLock: true }, { projection: { menteeId: 1, startAt: 1 } }).toArray(),
      ctx.c.walkIns.find({ eventId: event._id, mentorId: user._id, menteeId: { $in: ids }, deletedAt: null }, { projection: { menteeId: 1 } }).toArray(),
    ]);
    const startOf = new Map(appts.map((a) => [String(a.menteeId), a.startAt]));
    const mineSet = new Set(mine.map((w) => String(w.menteeId)));
    const body: E50Response = {
      items: found.map((m) => {
        const situation = walkInSituation({ status: m.status, walkedInByMe: mineSet.has(String(m._id)) });
        const startAt = situation === 'scheduled' ? startOf.get(String(m._id)) : undefined;
        return { mentee: toMenteeStaffView(m), situation, startAt: startAt ? iso(startAt) : null };
      }),
    };
    return body;
  });

  // E51 · POST /mentor/walk-ins · RN21
  // limite próprio (por sessão): é o único caminho da equipe que cria inscrição e manda e-mail para um endereço digitado
  route(
    app,
    ctx,
    E51,
    async ({ req, user, body, idem }) => respond(201, await createWalkIn(ctx, { mentor: user, actor: actorForRoute(req, 'mentor'), body, ip: req.ip, idem })),
    { rateLimit: { max: 30, timeWindow: '1 minute' } },
  );

  // E52 · GET /mentor/walk-ins
  route(app, ctx, E52, async ({ user }) => {
    const event = await loadEvent(ctx);
    const items = await ctx.c.walkIns.find({ eventId: event._id, mentorId: user._id, deletedAt: null }).sort({ at: -1, _id: -1 }).toArray();
    const mentees = await ctx.c.mentees.find({ _id: { $in: items.map((w) => w.menteeId) } }).toArray();
    const mm = new Map(mentees.map((m) => [String(m._id), m]));
    return { items: items.flatMap((w) => { const m = mm.get(String(w.menteeId)); return m ? [toWalkInView(w, m)] : []; }) };
  });

  // E53 · GET /admin/walk-ins?mentorId=&menteeId=
  route(app, ctx, E53List, async ({ query }) => {
    const event = await loadEvent(ctx);
    const filter: Record<string, unknown> = { eventId: event._id, deletedAt: null };
    if (query.mentorId) filter['mentorId'] = oid(query.mentorId);
    if (query.menteeId) filter['menteeId'] = oid(query.menteeId);
    const items = await ctx.c.walkIns.find(filter).sort({ at: -1, _id: -1 }).toArray();
    const [mentees, mentors] = await Promise.all([
      ctx.c.mentees.find({ _id: { $in: items.map((w) => w.menteeId) } }, { projection: { name: 1, email: 1, status: 1 } }).toArray(),
      ctx.c.users.find({ _id: { $in: items.map((w) => w.mentorId) } }, { projection: { name: 1 } }).toArray(),
    ]);
    const mm = new Map(mentees.map((m) => [String(m._id), m]));
    const uu = new Map(mentors.map((u) => [String(u._id), u.name]));
    const body: E53ListResponse = {
      items: items.flatMap((w) => {
        const m = mm.get(String(w.menteeId));
        if (!m) return [];
        return [{
          id: String(w._id),
          at: iso(w.at),
          note: w.note,
          mentor: { id: String(w.mentorId), name: uu.get(String(w.mentorId)) ?? 'Mentora' },
          mentee: { id: String(m._id), name: m.name, email: m.email, status: m.status },
          previousMenteeStatus: w.previousMenteeStatus,
        }];
      }),
    };
    return body;
  });

  // E53 · DELETE /admin/walk-ins/:id · remoção lógica; devolve à fila quem saiu dela por este atendimento
  route(app, ctx, E53Delete, async ({ req, user, params }) => {
    const event = await loadEvent(ctx);
    const id = oid(params.id);
    const actor = actorForRoute(req, 'admin');
    return runTxn(ctx, async (session) => {
      const now = ctx.now();
      const w = await ctx.c.walkIns.findOneAndUpdate(
        { _id: id, eventId: event._id, deletedAt: null },
        { $set: { deletedAt: now, deletedBy: user._id } },
        { session, returnDocument: 'after' },
      );
      if (!w) throw notFound('Atendimento');
      const m = await ctx.c.mentees.findOne({ _id: w.menteeId }, { session });
      let restoredToQueue = false;
      if (m) {
        const [appts, others] = await Promise.all([
          ctx.c.appointments.countDocuments({ menteeId: m._id, status: { $in: [...ACTIVE_OR_DONE] } }, { session }),
          ctx.c.walkIns.countDocuments({ eventId: event._id, menteeId: m._id, deletedAt: null }, { session }),
        ]);
        if (shouldRestoreToQueue({ previousMenteeStatus: w.previousMenteeStatus, currentStatus: m.status, hasAppointment: appts > 0 || m.currentAppointmentId !== null, otherActiveWalkIns: others })) {
          // `queuedAt` e prioridade nunca foram mexidos pelo atendimento: ela volta ao mesmo lugar da fila (RN03)
          const r = await ctx.c.mentees.updateOne({ _id: m._id, status: 'done' }, { $set: { status: 'waiting', updatedAt: now }, $inc: { version: 1 } }, { session });
          restoredToQueue = r.modifiedCount === 1;
          if (restoredToQueue) await writeAudit(ctx, session, { actor, action: 'mentee.walk_in_restore', entity: 'mentee', entityId: m._id, before: { status: 'done' }, after: { status: 'waiting' }, ip: req.ip });
        }
      }
      await writeAudit(ctx, session, { actor, action: 'walk_in.delete', entity: 'walk_in', entityId: w._id, before: { menteeId: String(w.menteeId), mentorId: String(w.mentorId), previousMenteeStatus: w.previousMenteeStatus }, after: { restoredToQueue }, ip: req.ip });
      return { ok: true as const, restoredToQueue };
    });
  });
}
