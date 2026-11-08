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
import { createWalkIn, scheduledTableOf, toWalkInView } from '../services/walk-in.js';
import { enqueueWalkInNotification } from '../lib/outbox.js';
import { shouldDeregisterOnWalkInRemoval, walkInSituation } from '../domain/index.js';

/** E50 procura em todas as situações menos `cancelled` (RN21). */
const SEARCHABLE = MENTEE_STATUSES.filter((s) => s !== 'cancelled');
/** Mentorias na mesa ativas ou concluídas: com uma delas, remover o atendimento não descadastra ninguém (`no_show` antigo não conta). */
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
      ctx.c.appointments.find({ eventId: event._id, menteeId: { $in: ids }, menteeLock: true }).toArray(),
      ctx.c.walkIns.find({ eventId: event._id, mentorId: user._id, menteeId: { $in: ids }, deletedAt: null }, { projection: { menteeId: 1 } }).toArray(),
    ]);
    // M7 avisa antes de confirmar que o registro cancela a mentoria da mesa (horário, mesa e mentora)
    const scheduledOf = new Map(await Promise.all(appts.map(async (a) => [String(a.menteeId), await scheduledTableOf(ctx, a)] as const)));
    const mineSet = new Set(mine.map((w) => String(w.menteeId)));
    const body: E50Response = {
      items: found.map((m) => {
        const situation = walkInSituation({ status: m.status, walkedInByMe: mineSet.has(String(m._id)) });
        const scheduled = situation === 'scheduled' ? (scheduledOf.get(String(m._id)) ?? null) : null;
        return { mentee: toMenteeStaffView(m), situation, startAt: scheduled?.startAt ?? null, scheduled };
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

  // E53 · DELETE /admin/walk-ins/:id · remoção lógica; descadastra a participante atendida só por este atendimento
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
      let deregistered = false;
      if (m) {
        const [tableAppointments, others] = await Promise.all([
          ctx.c.appointments.countDocuments({ menteeId: m._id, status: { $in: [...ACTIVE_OR_DONE] } }, { session }),
          ctx.c.walkIns.countDocuments({ eventId: event._id, menteeId: m._id, deletedAt: null }, { session }),
        ]);
        if (shouldDeregisterOnWalkInRemoval({ currentStatus: m.status, otherActiveWalkIns: others, tableAppointments })) {
          // descadastrada: sai dos números (E30, E31, E37, E49) e pode se inscrever de novo por P4 (E02 reativa, RN01)
          const r = await ctx.c.mentees.findOneAndUpdate(
            { _id: m._id, status: m.status },
            { $set: { status: 'cancelled', currentAppointmentId: null, priority: false, priorityReason: null, lastOutcome: null, updatedAt: now }, $inc: { version: 1 } },
            { session, returnDocument: 'after' },
          );
          if (!r) throw new AppError('CONFLICT', 'A participante acabou de mudar de situação. Tente de novo.');
          deregistered = true;
          // nenhuma mentoria dela segura a participante (menteeLock), para ela poder ser convidada depois da nova inscrição
          await ctx.c.appointments.updateMany({ menteeId: m._id, menteeLock: true }, { $unset: { menteeLock: '' } }, { session });
          // a avaliação dela só podia ser deste atendimento (sem mentoria na mesa nem outro atendimento): sai junto
          await ctx.c.feedbacks.deleteOne({ _id: m._id }, { session });
          await enqueueWalkInNotification(ctx, session, { type: 'walk_in_removed', mentee: r, walkInId: w._id });
          await writeAudit(ctx, session, { actor, action: 'mentee.walk_in_deregister', entity: 'mentee', entityId: m._id, before: { status: m.status }, after: { status: 'cancelled' }, ip: req.ip });
        }
      }
      await writeAudit(ctx, session, { actor, action: 'walk_in.delete', entity: 'walk_in', entityId: w._id, before: { menteeId: String(w.menteeId), mentorId: String(w.mentorId), previousMenteeStatus: w.previousMenteeStatus }, after: { deregistered }, ip: req.ip });
      return { ok: true as const, deregistered };
    });
  });
}
