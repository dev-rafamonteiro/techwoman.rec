import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E35, E35Detail, E36, E37, E37_CSV_COLUMNS, E38, E38Stream, type E35DetailResponse } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { csvLine } from '../lib/csv.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import { decodeCursor, encodeCursor, escapeRegex } from '../lib/pagination.js';
import { openSse } from '../lib/sse.js';
import { menteeSearchPipeline, runSearch } from '../search/text.js';
import { RAW, route } from '../lib/route.js';
import { iso, toMenteeAdminView, toTableView } from '../lib/views.js';
import { sha256Hex } from '../lib/tokens.js';
import { adminAppointmentViews } from '../services/admin-views.js';
import { applyTransition } from '../services/transitions.js';
import { randomBytes } from 'node:crypto';

type Filters = { status?: string; area?: string; priority?: boolean; period?: string; q?: string };

export function registerAdminMenteeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const oid = (s: string) => {
    if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    return new ObjectId(s);
  };

  const filterOf = (f: Filters): Record<string, unknown> => {
    const q: Record<string, unknown> = { eventId: ctx.config.eventId };
    if (f.status) q['status'] = f.status;
    if (f.area) q['area'] = f.area;
    if (f.priority) q['priority'] = true;
    if (f.period) q['preferredPeriod'] = f.period;
    if (f.q) q['$or'] = [{ name: { $regex: escapeRegex(f.q), $options: 'i' } }, { emailNorm: { $regex: escapeRegex(f.q.toLowerCase()) } }];
    return q;
  };

  /** Anexa mentoria, mentora e mesa às participantes (A4). */
  async function enrich(event: EventDoc, mentees: MenteeDoc[]) {
    const ids = mentees.map((m) => m.currentAppointmentId).filter((x): x is ObjectId => !!x);
    const appts = ids.length ? await ctx.c.appointments.find({ _id: { $in: ids } }).toArray() : [];
    const [users, tables] = await Promise.all([
      ctx.c.users.find({ _id: { $in: appts.map((a) => a.mentorId) } }, { projection: { name: 1 } }).toArray(),
      ctx.c.tables.find({ _id: { $in: appts.map((a) => a.tableId) } }).toArray(),
    ]);
    const aa = new Map(appts.map((a) => [String(a._id), a]));
    const uu = new Map(users.map((u) => [String(u._id), u.name]));
    const tt = new Map(tables.map((t) => [String(t._id), t]));
    return mentees.map((m) => {
      const a = m.currentAppointmentId ? aa.get(String(m.currentAppointmentId)) : undefined;
      return toMenteeAdminView(m, { appointment: a ?? null, mentorName: a ? uu.get(String(a.mentorId)) ?? null : null, table: a ? tt.get(String(a.tableId)) ?? null : null, event });
    });
  }

  // E35 · GET /admin/mentees
  route(app, ctx, E35, async ({ query }) => {
    const event = await loadEvent(ctx);
    if (query.q) {
      // busca livre: Atlas Search (até 50 itens, sem cursor)
      const found = await runSearch<MenteeDoc>(
        ctx,
        ctx.c.mentees,
        menteeSearchPipeline({
          q: query.q,
          eventId: event._id,
          admin: true,
          ...(query.status ? { status: query.status } : {}),
          ...(query.area ? { areas: [query.area] } : {}),
          ...(query.priority ? { priority: true } : {}),
          ...(query.period ? { period: query.period } : {}),
        }),
        'E35',
      );
      return { items: await enrich(event, found), nextCursor: null };
    }
    const filter = filterOf(query);
    const cur = decodeCursor<{ t: number; id: string }>(query.cursor);
    if (cur) {
      const t = new Date(cur.t);
      filter['$and'] = [{ $or: [{ createdAt: { $lt: t } }, { createdAt: t, _id: { $lt: oid(cur.id) } }] }];
    }
    const limit = 50;
    const docs = await ctx.c.mentees.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const page = docs.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await enrich(event, page), nextCursor: docs.length > limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: String(last._id) }) : null };
  });

  // E35 (detalhe) · GET /admin/mentees/:id
  route(app, ctx, E35Detail, async ({ params }) => {
    const event = await loadEvent(ctx);
    const m = await ctx.c.mentees.findOne({ _id: oid(params.id), eventId: event._id });
    if (!m) throw notFound('Participante');
    const [view] = await enrich(event, [m]);
    const [appts, outbox] = await Promise.all([
      ctx.c.appointments.find({ menteeId: m._id }).toArray(),
      ctx.c.outbox.find({ menteeId: m._id }).sort({ createdAt: 1 }).toArray(),
    ]);
    const timeline: E35DetailResponse['timeline'] = [{ at: iso(m.createdAt), kind: 'registered', appointmentId: null, entry: null, label: 'Inscrição' }];
    for (const a of appts) {
      for (const h of a.history) {
        timeline.push({ at: iso(h.at), kind: h.to, appointmentId: String(a._id), entry: { from: h.from, to: h.to, by: { userId: h.by.userId ? String(h.by.userId) : null, role: h.by.role }, at: iso(h.at), reason: h.reason }, label: h.to });
      }
    }
    timeline.sort((x, y) => x.at.localeCompare(y.at));
    return {
      mentee: view!,
      timeline,
      notifications: outbox.map((o) => ({ id: String(o._id), type: o.type, channel: o.channel, status: o.status, attempts: o.attempts, at: iso(o.createdAt) })),
    };
  });

  // E36 · PATCH /admin/mentees/:id
  route(app, ctx, E36, async ({ req, params, body }) => {
    const event = await loadEvent(ctx);
    const id = oid(params.id);
    const actor = actorForRoute(req, 'admin');
    const updated = await runTxn(ctx, async (session) => {
      const m = await ctx.c.mentees.findOne({ _id: id, eventId: event._id }, { session });
      if (!m) throw notFound('Participante');
      switch (body.action) {
        case 'set_priority': {
          if (m.status !== 'waiting') throw new AppError('INVALID_STATE', 'A prioridade só vale para quem está aguardando.');
          await ctx.c.mentees.updateOne({ _id: id, status: 'waiting' }, { $set: { priority: body.priority, priorityReason: body.priority ? 'manual' : null, updatedAt: ctx.now() }, $inc: { version: 1 } }, { session });
          await writeAudit(ctx, session, { actor, action: 'mentee.priority', entity: 'mentee', entityId: id, before: { priority: m.priority }, after: { priority: body.priority }, ip: req.ip });
          break;
        }
        case 'cancel': {
          if (m.status === 'cancelled') throw new AppError('INVALID_STATE', 'Inscrição já cancelada.');
          if (m.currentAppointmentId && (m.status === 'invited' || m.status === 'confirmed')) {
            await applyTransition(ctx, session, { appointmentId: m.currentAppointmentId, action: 'mentee_cancel', actor, reason: body.reason ?? 'cancelled_by_admin', ip: req.ip });
          } else {
            await ctx.c.mentees.updateOne({ _id: id }, { $set: { status: 'cancelled', currentAppointmentId: null, updatedAt: ctx.now() }, $inc: { version: 1 } }, { session });
            await writeAudit(ctx, session, { actor, action: 'mentee.cancel', entity: 'mentee', entityId: id, before: { status: m.status }, after: { status: 'cancelled' }, ip: req.ip });
          }
          break;
        }
        case 'resend_link': {
          if (m.status === 'cancelled' || m.status === 'no_show') throw new AppError('INVALID_STATE', 'Inscrição não está ativa.');
          const upd = await ctx.c.mentees.findOneAndUpdate({ _id: id }, { $inc: { linkSendCount: 1 } }, { session, returnDocument: 'after' });
          if (upd) await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: upd, dedupeSuffix: upd.linkSendCount });
          await writeAudit(ctx, session, { actor, action: 'mentee.resend_link', entity: 'mentee', entityId: id, ip: req.ip });
          break;
        }
        case 'anonymize': {
          if (m.currentAppointmentId && (m.status === 'invited' || m.status === 'confirmed')) {
            await applyTransition(ctx, session, { appointmentId: m.currentAppointmentId, action: 'mentee_cancel', actor, reason: 'anonymized', ip: req.ip });
          }
          await ctx.c.mentees.updateOne(
            { _id: id },
            {
              $set: {
                name: 'Participante anonimizada',
                email: `anon-${id}@anon.invalid`,
                emailNorm: `anon-${id}@anon.invalid`,
                phone: null,
                linkedin: null,
                note: null,
                quizScores: {},
                consent: null,
                status: 'cancelled',
                currentAppointmentId: null,
                tokenHash: sha256Hex(randomBytes(32).toString('hex')),
                anonymizedAt: ctx.now(),
                updatedAt: ctx.now(),
              },
              $inc: { tokenVersion: 1, version: 1 },
            },
            { session },
          );
          await ctx.c.outbox.deleteMany({ menteeId: id }, { session });
          // LGPD: o $inc de tokenVersion já revoga os links curtos; apagar tira o vínculo do banco
          await ctx.c.shortLinks.deleteMany({ menteeId: id }, { session });
          await writeAudit(ctx, session, { actor, action: 'mentee.anonymize', entity: 'mentee', entityId: id, ip: req.ip });
          break;
        }
      }
      return (await ctx.c.mentees.findOne({ _id: id }, { session }))!;
    });
    const [view] = await enrich(event, [updated]);
    return { mentee: view! };
  });

  // E37 · GET /admin/mentees/export.csv
  route(app, ctx, E37, async ({ req, reply, query }) => {
    const event = await loadEvent(ctx);
    const mentees = await ctx.c.mentees.find(filterOf(query)).sort({ createdAt: 1, _id: 1 }).toArray();
    const rows = await enrich(event, mentees);
    const periodLabel: Record<string, string> = { morning: 'Manhã', early_afternoon: 'Início da tarde', late_afternoon: 'Fim da tarde', any: 'Qualquer horário' };
    const lines = [csvLine([...E37_CSV_COLUMNS])];
    for (const r of rows) {
      lines.push(
        csvLine([r.name, r.email, r.phone, r.linkedin, r.area, periodLabel[r.preferredPeriod], r.status, r.priority ? 'sim' : 'não', r.mentorName, r.table?.number, r.slot?.startAt, r.createdAt]),
      );
    }
    await writeAudit(ctx, undefined, { actor: actorForRoute(req, 'admin'), action: 'mentee.export', entity: 'mentee', after: { rows: rows.length, filters: query }, ip: req.ip });
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="participantes.csv"')
      .header('Cache-Control', 'no-store')
      .send('﻿' + lines.join('\r\n') + '\r\n');
    return RAW;
  });

  // E38 · GET /admin/schedule
  route(app, ctx, E38, async () => {
    const event = await loadEvent(ctx);
    const [tables, appts] = await Promise.all([
      ctx.c.tables.find({ eventId: event._id }).sort({ number: 1 }).toArray(),
      ctx.c.appointments.find({ eventId: event._id, slotLock: true }).toArray(),
    ]);
    return {
      serverNow: iso(ctx.now()),
      timezone: event.timezone,
      slots: event.slots.map((s) => ({ id: s.id, startAt: iso(s.startAt), endAt: iso(s.endAt) })),
      tables: tables.map(toTableView),
      appointments: await adminAppointmentViews(ctx, event, appts as AppointmentDoc[]),
    };
  });

  // E38 · GET /admin/stream (SSE)
  route(app, ctx, E38Stream, async ({ req, reply, user }) => {
    openSse(ctx, req, reply, 'admin', user._id.toHexString());
    return RAW;
  }, { rateLimit: { max: 120, timeWindow: '1 minute' } });
}
