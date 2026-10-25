import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MenteeDoc } from '@tw/db';
import { E20, E21, E22, E23, E25, E26, E27, E28, QUEUE_PAGE_SIZE, type E20Response, type E25Response } from '@tw/shared';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, fromRuleError, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { menteeSearchPipeline, runSearch } from '../search/text.js';
import { normalizeLinkedin, normalizeOptionalPhone } from '../lib/normalize.js';
import { openSse } from '../lib/sse.js';
import { RAW, route } from '../lib/route.js';
import { toMenteeStaffView, toMentorAppointmentView, toSlot, toTableView, toUserView } from '../lib/views.js';
import { applyTransition } from '../services/transitions.js';
import { checkAvailabilityUpdate, matchesPeriod, suggestTable } from '../domain/index.js';

const ACTIVE = ['invited', 'confirmed', 'in_progress'] as const;

export function registerMentorRoutes(app: FastifyInstance, ctx: AppContext): void {
  const oid = (s: string) => {
    if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    return new ObjectId(s);
  };

  async function buildAvailability(mentorId: ObjectId, availability: string[]): Promise<E20Response> {
    const event = await loadEvent(ctx);
    const appts = await ctx.c.appointments.find({ eventId: event._id, mentorId, status: { $in: [...ACTIVE] } }).toArray();
    const mentees = await ctx.c.mentees.find({ _id: { $in: appts.map((a) => a.menteeId) } }, { projection: { name: 1 } }).toArray();
    const nameOf = new Map(mentees.map((m) => [String(m._id), m.name]));
    const av = new Set(availability);
    return {
      timezone: event.timezone,
      slots: event.slots.map((s) => {
        const a = appts.find((x) => x.slotId === s.id);
        return {
          slot: toSlot(s),
          available: av.has(s.id),
          locked: a ? { appointmentId: String(a._id), menteeName: nameOf.get(String(a.menteeId)) ?? '' } : null,
        };
      }),
    };
  }

  // E20 · GET /mentor/availability
  route(app, ctx, E20, async ({ user }) => buildAvailability(user._id, user.availability));

  // E21 · PUT /mentor/availability · RN11
  route(app, ctx, E21, async ({ req, user, body }) => {
    const slotIds = [...new Set(body.slotIds)];
    const event = await loadEvent(ctx);
    const updated = await runTxn(ctx, async (session) => {
      const me = await ctx.c.users.findOne({ _id: user._id }, { session });
      if (!me) throw notFound('Mentora');
      const appts = await ctx.c.appointments.find({ eventId: event._id, mentorId: me._id, status: { $in: [...ACTIVE] } }, { session }).toArray();
      const check = checkAvailabilityUpdate({
        current: me.availability,
        next: slotIds,
        appointments: appts.map((a) => ({ slotId: a.slotId, status: a.status })),
        validSlotIds: event.slots.map((s) => s.id),
      });
      if (!check.ok) throw fromRuleError(check);
      const next = event.slots.map((s) => s.id).filter((id) => slotIds.includes(id));
      await ctx.c.users.updateOne({ _id: me._id }, { $set: { availability: next, updatedAt: ctx.now() } }, { session });
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'mentor'), action: 'availability.update', entity: 'user', entityId: me._id, before: { availability: me.availability }, after: { availability: next }, ip: req.ip });
      return next;
    });
    return buildAvailability(user._id, updated);
  });

  // E22 · GET /mentor/queue · RN03 · sem contato
  route(app, ctx, E22, async ({ user, query }) => {
    const now = ctx.now();
    const event = await loadEvent(ctx);
    let page: MenteeDoc[];
    let nextCursor: string | null = null;
    if (query.q) {
      // busca livre: Atlas Search (até 50 itens, sem cursor), sem contato
      page = await runSearch<MenteeDoc>(
        ctx,
        ctx.c.mentees,
        menteeSearchPipeline({ q: query.q, eventId: event._id, status: 'waiting', ...(query.area?.length ? { areas: query.area } : {}), ...(query.period ? { period: query.period } : {}), ...(query.priority ? { priority: true } : {}) }),
        'E22',
      );
    } else {
      const filter: Record<string, unknown> = { eventId: event._id, status: 'waiting' };
      if (query.area?.length) filter['area'] = { $in: query.area };
      if (query.period) filter['preferredPeriod'] = query.period;
      if (query.priority) filter['priority'] = true;
      const cur = decodeCursor<{ p: boolean; t: number; id: string }>(query.cursor);
      if (cur) {
        const t = new Date(cur.t);
        const id = oid(cur.id);
        const after = { $or: [{ queuedAt: { $gt: t } }, { queuedAt: t, _id: { $gt: id } }] };
        filter['$and'] = [cur.p ? { $or: [{ priority: true, ...after }, { priority: false }] } : { priority: false, ...after }];
      }
      const docs = await ctx.c.mentees.find(filter).sort({ priority: -1, queuedAt: 1, _id: 1 }).limit(QUEUE_PAGE_SIZE + 1).toArray();
      page = docs.slice(0, QUEUE_PAGE_SIZE);
      const last = page[page.length - 1];
      nextCursor = docs.length > QUEUE_PAGE_SIZE && last ? encodeCursor({ p: last.priority, t: last.queuedAt.getTime(), id: String(last._id) }) : null;
    }
    const taken = await ctx.c.appointments.find({ eventId: event._id, mentorId: user._id, slotLock: true }, { projection: { slotId: 1 } }).toArray();
    const takenSet = new Set(taken.map((a) => a.slotId));
    const freeSlots = event.slots.filter((s) => user.availability.includes(s.id) && !takenSet.has(s.id) && s.startAt.getTime() > now.getTime()).length;
    return {
      items: page.map(toMenteeStaffView),
      nextCursor,
      freeSlots,
      hasAvailability: user.availability.length > 0,
    };
  });

  // E23 · GET /mentor/options · RN13
  route(app, ctx, E23, async ({ user, query }) => {
    const now = ctx.now();
    const event = await loadEvent(ctx);
    const mentee = await ctx.c.mentees.findOne({ _id: oid(query.menteeId), eventId: event._id });
    if (!mentee) throw notFound('Participante');
    if (mentee.status !== 'waiting') throw new AppError('MENTEE_TAKEN', 'Outra mentora acabou de convidar esta participante.');
    const mine = await ctx.c.appointments.find({ eventId: event._id, mentorId: user._id, slotLock: true }).toArray();
    const busy = new Set(mine.map((a) => a.slotId));
    const lead = event.minLeadMinutes * 60_000;
    const free = event.slots.filter((s) => user.availability.includes(s.id) && !busy.has(s.id) && s.startAt.getTime() - now.getTime() >= lead);
    const slots = free.map((s) => ({ ...toSlot(s), preferred: matchesPeriod(mentee.preferredPeriod, s.startAt, event.timezone) && mentee.preferredPeriod !== 'any' }));
    const chosen = (query.slotId ? free.find((s) => s.id === query.slotId) : undefined) ?? free.find((s) => matchesPeriod(mentee.preferredPeriod, s.startAt, event.timezone)) ?? free[0] ?? null;
    let tables: { table: ReturnType<typeof toTableView>; free: boolean }[] = [];
    let suggestedTableId: string | null = null;
    let previousTableId: string | null = null;
    if (chosen) {
      const [all, occupied] = await Promise.all([
        ctx.c.tables.find({ eventId: event._id, active: true }).sort({ number: 1 }).toArray(),
        ctx.c.appointments.find({ eventId: event._id, slotId: chosen.id, slotLock: true }, { projection: { tableId: 1 } }).toArray(),
      ]);
      const occ = new Set(occupied.map((a) => String(a.tableId)));
      tables = all.map((t) => ({ table: toTableView(t), free: !occ.has(String(t._id)) }));
      const freeTables = all.filter((t) => !occ.has(String(t._id))).map((t) => ({ id: String(t._id), number: t.number }));
      const s = suggestTable({
        chosenStartAt: chosen.startAt,
        mentorAppointments: mine.map((a) => ({ tableId: String(a.tableId), startAt: a.startAt })),
        freeTables,
      });
      suggestedTableId = s.suggestedTableId;
      previousTableId = s.previousTableId;
    }
    return {
      slots,
      selectedSlotId: chosen?.id ?? null,
      tables: tables.map((t) => ({ ...t.table, free: t.free })),
      suggestedTableId,
      previousTableId,
    };
  });

  // E24 · POST /mentor/appointments: registrada em routes/mentor-invite.ts (aguarda aprovação do plano)

  // E25 · GET /mentor/appointments
  route(app, ctx, E25, async ({ user }) => {
    const event = await loadEvent(ctx);
    const appts = await ctx.c.appointments.find({ eventId: event._id, mentorId: user._id, slotLock: true }).toArray();
    const [mentees, tables] = await Promise.all([
      ctx.c.mentees.find({ _id: { $in: appts.map((a) => a.menteeId) } }).toArray(),
      ctx.c.tables.find({ _id: { $in: appts.map((a) => a.tableId) } }).toArray(),
    ]);
    const mm = new Map(mentees.map((m) => [String(m._id), m]));
    const tt = new Map(tables.map((t) => [String(t._id), t]));
    const body: E25Response = {
      timezone: event.timezone,
      serverNow: ctx.now().toISOString(),
      slots: event.slots
        .filter((s) => user.availability.includes(s.id) || appts.some((a) => a.slotId === s.id))
        .map((s) => {
          const a = appts.find((x) => x.slotId === s.id);
          const m = a && mm.get(String(a.menteeId));
          const t = a && tt.get(String(a.tableId));
          return { slot: toSlot(s), appointment: a && m && t ? toMentorAppointmentView(a, m, t) : null };
        }),
    };
    return body;
  });

  // E26 · PATCH /mentor/appointments/:id · RN08–RN10
  route(app, ctx, E26, async ({ req, user, params, body, idem }) => {
    const action = body.action === 'cancel' ? 'staff_cancel' : body.action;
    const { appointment } = await runTxn(ctx, async (session) => {
      const res = await applyTransition(ctx, session, {
        appointmentId: oid(params.id),
        action,
        actor: actorForRoute(req, 'mentor'),
        scope: { mentorId: user._id },
        reason: body.action === 'cancel' ? (body.reason ?? null) : null,
        ip: req.ip,
      });
      if (!res) throw notFound('Mentoria');
      const table = await ctx.c.tables.findOne({ _id: res.appointment.tableId }, { session });
      if (!table) throw notFound('Mesa');
      const out = { appointment: toMentorAppointmentView(res.appointment, res.mentee, table) };
      await idem?.markDone(session, { status: 200, body: out });
      return { appointment: out.appointment };
    });
    return { appointment };
  });

  // E27 · GET /mentor/stream (SSE)
  route(
    app,
    ctx,
    E27,
    async ({ req, reply, user }) => {
      openSse(ctx, req, reply, 'mentor', user._id.toHexString());
      return RAW;
    },
    { rateLimit: { max: 120, timeWindow: '1 minute' } },
  );

  // E28 · PATCH /mentor/profile
  route(app, ctx, E28, async ({ req, user, body }) => {
    const event = await loadEvent(ctx);
    const set: Record<string, unknown> = { updatedAt: ctx.now() };
    if (body.name !== undefined) set['name'] = body.name;
    if (body.linkedin !== undefined) {
      const l = normalizeLinkedin(body.linkedin);
      if (l === undefined) throw new AppError('VALIDATION_ERROR', 'LinkedIn inválido.', { details: { field: 'linkedin' } });
      set['linkedin'] = l;
    }
    if (body.phone !== undefined) {
      const p = normalizeOptionalPhone(body.phone);
      if (p === undefined) throw new AppError('VALIDATION_ERROR', 'Telefone inválido. Informe DDD e número.', { details: { field: 'phone' } });
      set['phone'] = p;
    }
    if (body.photoUrl !== undefined) set['photoUrl'] = body.photoUrl;
    if (body.bio !== undefined) set['bio'] = body.bio;
    if (body.areas !== undefined) {
      const keys = new Set(event.areas.map((a) => a.key));
      if (body.areas.some((a) => !keys.has(a))) throw new AppError('VALIDATION_ERROR', 'Área desconhecida.', { details: { field: 'areas' } });
      set['areas'] = [...new Set(body.areas)];
    }
    const after = await ctx.c.users.findOneAndUpdate({ _id: user._id }, { $set: set }, { returnDocument: 'after' });
    if (!after) throw notFound('Mentora');
    await writeAudit(ctx, undefined, { actor: actorForRoute(req, 'mentor'), action: 'user.profile_update', entity: 'user', entityId: user._id, after: { fields: Object.keys(set).filter((k) => k !== 'updatedAt') }, ip: req.ip });
    return { user: toUserView(after) };
  });
}
