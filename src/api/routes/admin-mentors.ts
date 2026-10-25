import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E30, E31Create, E31List, E32, E33, E34, type E30Response, type MentorListItem } from '@tw/shared';
import { generateProvisionalPassword, hashPassword, tempPasswordExpiry, importMentors, ImportFormatError, type UserDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, fromRuleError, isDuplicateKey, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';

import { normalizeLinkedin, normalizeOptionalPhone } from '../lib/normalize.js';
import { enqueueStaffPassword } from '../lib/outbox.js';
import { mentorSearchPipeline, runSearch } from '../search/text.js';
import { respond, route } from '../lib/route.js';
import { iso, toUserView } from '../lib/views.js';
import { canGrantAdminRole, checkAvailabilityUpdate, checkSuperAdminInvariant, mentorDisableBlockers } from '../domain/index.js';

const ACTIVE = ['invited', 'confirmed', 'in_progress'] as const;

export function registerAdminMentorRoutes(app: FastifyInstance, ctx: AppContext): void {
  const oid = (s: string) => {
    if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    return new ObjectId(s);
  };

  // E30 · GET /admin/dashboard
  route(app, ctx, E30, async () => {
    const now = ctx.now();
    const event = await loadEvent(ctx);
    const eid = event._id;
    const { appointments: ap, mentees: me, users, tables } = ctx.c;
    const [byStatus, menteeByStatus, byArea, byHour, activeTables, mentors, occupied, futureBooked] = await Promise.all([
      ap.aggregate<{ _id: string; n: number }>([{ $match: { eventId: eid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      me.aggregate<{ _id: string; n: number }>([{ $match: { eventId: eid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      me.aggregate<{ _id: string; n: number }>([{ $match: { eventId: eid } }, { $group: { _id: '$area', n: { $sum: 1 } } }]).toArray(),
      me.aggregate<{ _id: Date; n: number }>([{ $match: { eventId: eid } }, { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: 'hour' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
      tables.countDocuments({ eventId: eid, active: true }),
      users.find({ roles: 'mentor', status: 'active' }, { projection: { availability: 1, lastLoginAt: 1 } }).toArray(),
      ap.countDocuments({ eventId: eid, status: { $in: [...ACTIVE] }, startAt: { $lte: now }, endAt: { $gt: now } }),
      ap.find({ eventId: eid, slotLock: true, startAt: { $gt: now } }, { projection: { slotId: 1 } }).toArray(),
    ]);
    const cnt = (list: { _id: string; n: number }[], k: string) => list.find((x) => x._id === k)?.n ?? 0;
    const registered = menteeByStatus.reduce((s, x) => s + x.n, 0);
    const bookedBySlot = new Map<string, number>();
    for (const a of futureBooked) bookedBySlot.set(a.slotId, (bookedBySlot.get(a.slotId) ?? 0) + 1);
    let remainingCapacity = 0;
    for (const s of event.slots) {
      if (s.startAt.getTime() <= now.getTime()) continue;
      const mentorsHere = mentors.filter((m) => m.availability.includes(s.id)).length;
      remainingCapacity += Math.max(0, Math.min(activeTables, mentorsHere) - (bookedBySlot.get(s.id) ?? 0));
    }
    const label = new Map(event.areas.map((a) => [a.key, a.label]));

    const [expiring, late, priorityWaiting] = await Promise.all([
      ap.find({ eventId: eid, status: 'invited', expiresAt: { $gt: now, $lte: new Date(now.getTime() + 3 * 60_000) } }).limit(20).toArray(),
      ap.find({ eventId: eid, status: 'confirmed', startAt: { $lte: new Date(now.getTime() - 5 * 60_000) }, endAt: { $gt: now } }).limit(20).toArray(),
      me.find({ eventId: eid, status: 'waiting', priority: true, queuedAt: { $lte: new Date(now.getTime() - 30 * 60_000) } }).sort({ queuedAt: 1 }).limit(20).toArray(),
    ]);
    const refs = [...expiring, ...late];
    const [rm, ru, rt] = await Promise.all([
      me.find({ _id: { $in: refs.map((a) => a.menteeId) } }, { projection: { name: 1 } }).toArray(),
      users.find({ _id: { $in: refs.map((a) => a.mentorId) } }, { projection: { name: 1 } }).toArray(),
      tables.find({ _id: { $in: refs.map((a) => a.tableId) } }, { projection: { number: 1 } }).toArray(),
    ]);
    const nm = new Map(rm.map((x) => [String(x._id), x.name]));
    const nu = new Map(ru.map((x) => [String(x._id), x.name]));
    const nt = new Map(rt.map((x) => [String(x._id), x.number]));
    const attention: E30Response['attention'] = [
      ...expiring.map((a) => ({ kind: 'invite_expiring' as const, appointmentId: String(a._id), menteeId: String(a.menteeId), menteeName: nm.get(String(a.menteeId)) ?? '', mentorName: nu.get(String(a.mentorId)) ?? null, tableNumber: nt.get(String(a.tableId)) ?? null, at: iso(a.expiresAt ?? a.startAt) })),
      ...late.map((a) => ({ kind: 'table_late' as const, appointmentId: String(a._id), menteeId: String(a.menteeId), menteeName: nm.get(String(a.menteeId)) ?? '', mentorName: nu.get(String(a.mentorId)) ?? null, tableNumber: nt.get(String(a.tableId)) ?? null, at: iso(a.startAt) })),
      ...priorityWaiting.map((m) => ({ kind: 'priority_waiting' as const, appointmentId: null, menteeId: String(m._id), menteeName: m.name, mentorName: null, tableNumber: null, at: iso(m.queuedAt) })),
    ];
    return {
      serverNow: iso(now),
      counts: {
        registered,
        waiting: cnt(menteeByStatus, 'waiting'),
        invitesPending: cnt(byStatus, 'invited'),
        confirmed: cnt(byStatus, 'confirmed') + cnt(byStatus, 'in_progress'),
        done: cnt(byStatus, 'done'),
        noShow: cnt(byStatus, 'no_show'),
      },
      tables: { occupiedNow: occupied, total: activeTables },
      remainingCapacity,
      mentors: { loggedIn: mentors.filter((m) => m.lastLoginAt).length, total: mentors.length },
      registeredByArea: byArea.map((a) => ({ area: a._id, label: label.get(a._id) ?? a._id, count: a.n })),
      registeredByHour: byHour.map((h) => ({ hour: iso(h._id), count: h.n })),
      attention,
    };
  });

  // E31 · GET /admin/mentors
  route(app, ctx, E31List, async ({ query }) => {
    const filter: Record<string, unknown> = { roles: 'mentor' };
    if (query.status === 'active' || query.status === 'disabled') filter['status'] = query.status;
    if (query.status === 'never_logged_in') filter['lastLoginAt'] = null;
    if (query.area) filter['areas'] = query.area;
    // busca livre: Atlas Search (até 50 itens, na ordem de relevância); sem q, todas por nome
    const users = query.q
      ? await runSearch<UserDoc>(
          ctx,
          ctx.c.users,
          mentorSearchPipeline({
            q: query.q,
            ...(query.status === 'active' || query.status === 'disabled' ? { status: query.status } : {}),
            ...(query.status === 'never_logged_in' ? { neverLoggedIn: true } : {}),
            ...(query.area ? { area: query.area } : {}),
          }),
          'E31',
        )
      : await ctx.c.users.find(filter).sort({ name: 1 }).toArray();
    const counts = await ctx.c.appointments
      .aggregate<{ _id: { m: ObjectId; s: string }; n: number }>([
        { $match: { eventId: ctx.config.eventId, mentorId: { $in: users.map((u) => u._id) }, status: { $in: ['confirmed', 'in_progress', 'done'] } } },
        { $group: { _id: { m: '$mentorId', s: '$status' }, n: { $sum: 1 } } },
      ])
      .toArray();
    const n = (id: ObjectId, ...st: string[]) => counts.filter((c) => c._id.m.equals(id) && st.includes(c._id.s)).reduce((s, c) => s + c.n, 0);
    const items: MentorListItem[] = users.map((u) => ({
      ...toUserView(u),
      availableSlots: u.availability.length,
      confirmedCount: n(u._id, 'confirmed', 'in_progress'),
      doneCount: n(u._id, 'done'),
      neverLoggedIn: u.lastLoginAt === null,
    }));
    return { items };
  });

  // E31 · POST /admin/mentors
  route(app, ctx, E31Create, async ({ req, user, body }) => {
    const event = await loadEvent(ctx);
    if (body.alsoAdmin && !canGrantAdminRole(user.roles)) throw new AppError('FORBIDDEN', 'Só super admin pode conceder o papel de admin.');
    const keys = new Set(event.areas.map((a) => a.key));
    if (body.areas.some((a) => !keys.has(a))) throw new AppError('VALIDATION_ERROR', 'Área desconhecida.', { details: { field: 'areas' } });
    const slotIds = new Set(event.slots.map((s) => s.id));
    if (body.availability.some((s) => !slotIds.has(s))) throw new AppError('VALIDATION_ERROR', 'Horário inexistente na grade.', { details: { field: 'availability' } });
    const linkedin = normalizeLinkedin(body.linkedin);
    if (linkedin === undefined && body.linkedin !== undefined) throw new AppError('VALIDATION_ERROR', 'LinkedIn inválido.', { details: { field: 'linkedin' } });
    const phone = normalizeOptionalPhone(body.phone);
    if (phone === undefined && body.phone !== undefined) throw new AppError('VALIDATION_ERROR', 'Telefone inválido. Informe DDD e número.', { details: { field: 'phone' } });
    const password = generateProvisionalPassword();
    const now = ctx.now();
    const doc: UserDoc = {
      _id: new ObjectId(),
      name: body.name,
      email: body.email,
      roles: body.alsoAdmin ? ['mentor', 'admin'] : ['mentor'],
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      status: 'active',
      linkedin: linkedin ?? null,
      phone: phone ?? null,
      organization: body.organization ?? null,
      areas: [...new Set(body.areas)],
      bio: body.bio ?? null,
      photoUrl: body.photoUrl ?? null,
      availability: event.slots.map((s) => s.id).filter((id) => body.availability.includes(id)),
      lastLoginAt: null,
      failedLogins: 0,
      failedLoginWindowStart: null,
      lockedUntil: null,
      passwordChangedAt: null,
      passwordResetCount: body.sendPasswordByEmail ? 1 : 0,
      tempPasswordExpiresAt: tempPasswordExpiry(now),
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await runTxn(ctx, async (session) => {
        await ctx.c.users.insertOne(doc, { session });
        if (body.sendPasswordByEmail) await enqueueStaffPassword(ctx, session, doc, 1, password);
        await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: 'mentor.create', entity: 'user', entityId: doc._id, after: { email: doc.email, roles: doc.roles }, ip: req.ip });
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw new AppError('EMAIL_TAKEN', 'Já existe uma conta com esse e-mail.');
      throw err;
    }
    return respond(201, { user: toUserView(doc), provisionalPassword: password });
  });

  // E32 · PATCH /admin/mentors/:id · RN11, RN12
  route(app, ctx, E32, async ({ req, user, params, body }) => {
    const event = await loadEvent(ctx);
    const id = oid(params.id);
    if (body.alsoAdmin !== undefined && !canGrantAdminRole(user.roles)) throw new AppError('FORBIDDEN', 'Só super admin pode alterar o papel de admin.');
    const updated = await runTxn(ctx, async (session) => {
      const target = await ctx.c.users.findOne({ _id: id, roles: 'mentor' }, { session });
      if (!target) throw notFound('Mentora');
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
      if (body.organization !== undefined) set['organization'] = body.organization;
      if (body.bio !== undefined) set['bio'] = body.bio;
      if (body.photoUrl !== undefined) set['photoUrl'] = body.photoUrl;
      if (body.areas !== undefined) {
        const keys = new Set(event.areas.map((a) => a.key));
        if (body.areas.some((a) => !keys.has(a))) throw new AppError('VALIDATION_ERROR', 'Área desconhecida.', { details: { field: 'areas' } });
        set['areas'] = [...new Set(body.areas)];
      }
      const active = await ctx.c.appointments.find({ eventId: event._id, mentorId: id, status: { $in: [...ACTIVE] } }, { session }).toArray();
      if (body.availability !== undefined) {
        const next = [...new Set(body.availability)];
        const check = checkAvailabilityUpdate({ current: target.availability, next, appointments: active.map((a) => ({ slotId: a.slotId, status: a.status })), validSlotIds: event.slots.map((s) => s.id) });
        if (!check.ok) throw fromRuleError(check);
        set['availability'] = event.slots.map((s) => s.id).filter((s) => next.includes(s));
      }
      if (body.alsoAdmin !== undefined) {
        const hasAdmin = target.roles.includes('admin');
        if (body.alsoAdmin && !hasAdmin) set['roles'] = [...target.roles, 'admin'];
        if (!body.alsoAdmin && hasAdmin) {
          const nextRoles = target.roles.filter((r) => r !== 'admin');
          const all = await ctx.c.users.find({ roles: 'super_admin' }, { session, projection: { roles: 1, status: 1 } }).toArray();
          const inv = checkSuperAdminInvariant(all.map((u) => ({ id: String(u._id), roles: u.roles, status: u.status })), { userId: String(id), roles: nextRoles });
          if (!inv.ok) throw fromRuleError(inv);
          set['roles'] = nextRoles;
        }
      }
      let revoke = false;
      if (body.status !== undefined && body.status !== target.status) {
        if (body.status === 'disabled') {
          const blockers = mentorDisableBlockers(active.map((a) => ({ id: String(a._id), status: a.status, startAt: a.startAt, endAt: a.endAt })), ctx.now());
          if (blockers.length) {
            const ids = new Map(active.map((a) => [String(a._id), a]));
            const tables = await ctx.c.tables.find({ _id: { $in: active.map((a) => a.tableId) } }, { session }).toArray();
            const mentees = await ctx.c.mentees.find({ _id: { $in: active.map((a) => a.menteeId) } }, { session, projection: { name: 1 } }).toArray();
            throw new AppError('MENTOR_HAS_APPOINTMENTS', 'A mentora tem mentorias futuras ativas. Realoque ou cancele antes de desativar.', {
              details: {
                appointments: blockers.map((b) => {
                  const a = ids.get(b.id)!;
                  return { id: b.id, startAt: iso(b.startAt), tableNumber: tables.find((t) => t._id.equals(a.tableId))?.number ?? 0, menteeName: mentees.find((m) => m._id.equals(a.menteeId))?.name ?? '', status: b.status };
                }),
              },
            });
          }
          if (target.roles.includes('super_admin')) {
            const all = await ctx.c.users.find({ roles: 'super_admin' }, { session, projection: { roles: 1, status: 1 } }).toArray();
            const inv = checkSuperAdminInvariant(all.map((u) => ({ id: String(u._id), roles: u.roles, status: u.status })), { userId: String(id), status: 'disabled' });
            if (!inv.ok) throw fromRuleError(inv);
          }
          revoke = true;
        }
        set['status'] = body.status;
      }
      const after = await ctx.c.users.findOneAndUpdate({ _id: id }, { $set: set }, { session, returnDocument: 'after' });
      if (revoke) await ctx.c.sessions.deleteMany({ userId: id }, { session });
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: body.status === 'disabled' ? 'mentor.disable' : body.status === 'active' && target.status === 'disabled' ? 'mentor.enable' : 'mentor.update', entity: 'user', entityId: id, before: { status: target.status }, after: { fields: Object.keys(set).filter((k) => k !== 'updatedAt'), status: set['status'] ?? target.status }, ip: req.ip });
      return after!;
    });
    return { user: toUserView(updated) };
  });

  // E33 · POST /admin/mentors/import (multipart CSV, ?dryRun=true)
  route(
    app,
    ctx,
    E33,
    async ({ req, user, query }) => {
      const event = await loadEvent(ctx);
      const file = await req.file({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
      if (!file) throw new AppError('VALIDATION_ERROR', 'Envie o arquivo CSV no campo "file".');
      const buf = await file.toBuffer();
      if (file.file.truncated) throw new AppError('PAYLOAD_TOO_LARGE', 'O CSV passa de 2 MB.');
      const dryRun = query.dryRun ?? false;
      try {
        const res = await importMentors(ctx.db, buf.toString('utf8'), { event, dryRun, onExisting: query.onExisting ?? 'skip', createdBy: user._id, now: ctx.now() });
        if (!dryRun) {
          await writeAudit(ctx, undefined, { actor: actorForRoute(req, 'admin'), action: 'mentor.import', entity: 'user', after: res.summary, ip: req.ip });
        }
        return res;
      } catch (err) {
        if (err instanceof ImportFormatError) throw new AppError('VALIDATION_ERROR', err.message);
        throw err;
      }
    },
    { rawBody: true },
  );

  // E34 · POST /admin/mentors/:id/reset-password
  route(app, ctx, E34, async ({ req, user, params, body }) => {
    const id = oid(params.id);
    const password = generateProvisionalPassword();
    const hash = await hashPassword(password);
    await runTxn(ctx, async (session) => {
      const target = await ctx.c.users.findOne({ _id: id, roles: 'mentor' }, { session });
      if (!target) throw notFound('Mentora');
      if ((target.roles.includes('admin') || target.roles.includes('super_admin')) && !canGrantAdminRole(user.roles)) {
        throw new AppError('FORBIDDEN', 'Só super admin redefine a senha de um administrador.');
      }
      const upd = await ctx.c.users.findOneAndUpdate(
        { _id: id },
        { $set: { passwordHash: hash, mustChangePassword: true, passwordChangedAt: null, tempPasswordExpiresAt: tempPasswordExpiry(ctx.now()), failedLogins: 0, failedLoginWindowStart: null, lockedUntil: null, updatedAt: ctx.now() }, $inc: { passwordResetCount: 1 } },
        { session, returnDocument: 'after' },
      );
      await ctx.c.sessions.deleteMany({ userId: id }, { session });
      if (body.sendByEmail && upd) await enqueueStaffPassword(ctx, session, upd, upd.passwordResetCount, password);
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: 'mentor.reset_password', entity: 'user', entityId: id, ip: req.ip });
    });
    return { provisionalPassword: password };
  });

}
