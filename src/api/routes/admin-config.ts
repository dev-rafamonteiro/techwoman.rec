import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import QRCode from 'qrcode';
import {
  E40Get, E40Put, E41Get, E41Put, E42Png, E42Svg, E43Create, E43List, E43Patch, E44List, E44Retry, E45,
  generateSlots, type EventConfig,
} from '@tw/shared';
import { generateProvisionalPassword, hashPassword, type EventDoc, type UserDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, fromRuleError, isDuplicateKey, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { enqueueStaffPassword } from '../lib/outbox.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { RAW, respond, route } from '../lib/route.js';
import { iso, toOutboxItemView, toTableView, toUserView } from '../lib/views.js';
import { checkGridChange, checkSuperAdminInvariant } from '../domain/index.js';

const ACTIVE = ['invited', 'confirmed', 'in_progress'] as const;

export function toEventConfig(ev: EventDoc): EventConfig {
  return {
    id: ev._id,
    name: ev.name,
    date: ev.date,
    location: ev.location,
    timezone: ev.timezone,
    startTime: ev.startTime,
    endTime: ev.endTime,
    slotMinutes: ev.slotMinutes,
    gapMinutes: ev.gapMinutes,
    slots: ev.slots.map((s) => ({ id: s.id, startAt: iso(s.startAt), endAt: iso(s.endAt) })),
    responseWindowMinutes: ev.responseWindowMinutes,
    minLeadMinutes: ev.minLeadMinutes,
    registrationOpen: ev.registrationOpen,
    areas: ev.areas,
    templates: ev.templates,
    version: ev.version,
  };
}

export function registerAdminConfigRoutes(app: FastifyInstance, ctx: AppContext): void {
  const oid = (s: string) => {
    if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    return new ObjectId(s);
  };

  // E40 · GET/PUT /admin/tables (super admin)
  route(app, ctx, E40Get, async () => {
    const tables = await ctx.c.tables.find({ eventId: ctx.config.eventId }).sort({ number: 1 }).toArray();
    return { tables: tables.map(toTableView) };
  });

  route(app, ctx, E40Put, async ({ req, body }) => {
    const nums = body.tables.map((t) => t.number);
    if (new Set(nums).size !== nums.length) throw new AppError('VALIDATION_ERROR', 'Há números de mesa repetidos.');
    const eventId = ctx.config.eventId;
    await runTxn(ctx, async (session) => {
      const now = ctx.now();
      const current = await ctx.c.tables.find({ eventId }, { session }).toArray();
      const keep = new Set(body.tables.filter((t) => t.id).map((t) => t.id));
      const appts = await ctx.c.appointments.find({ eventId }, { session }).toArray();
      const blockers: { id: string; tableNumber: number; startAt: string; mentorName: string; menteeName: string }[] = [];
      const guard = async (tableId: ObjectId, number: number, onlyFuture: boolean) => {
        const hit = appts.filter((a) => a.tableId.equals(tableId) && (onlyFuture ? (ACTIVE as readonly string[]).includes(a.status) && a.endAt > now : true));
        for (const a of hit) {
          const [mentor, mentee] = await Promise.all([ctx.c.users.findOne({ _id: a.mentorId }, { session, projection: { name: 1 } }), ctx.c.mentees.findOne({ _id: a.menteeId }, { session, projection: { name: 1 } })]);
          blockers.push({ id: String(a._id), tableNumber: number, startAt: iso(a.startAt), mentorName: mentor?.name ?? '', menteeName: mentee?.name ?? '' });
        }
      };
      for (const t of current) {
        if (!keep.has(String(t._id))) await guard(t._id, t.number, false); // remover mesa com qualquer mentoria
      }
      for (const t of body.tables) {
        if (t.id && t.active === false) {
          const cur = current.find((c) => String(c._id) === t.id);
          if (cur?.active) await guard(cur._id, cur.number, true);
        }
      }
      if (blockers.length) throw new AppError('TABLE_IN_USE', 'Há mentorias nessas mesas. Realoque antes de desativar ou remover.', { details: { appointments: blockers } });
      for (const t of current) if (!keep.has(String(t._id))) await ctx.c.tables.deleteOne({ _id: t._id }, { session });
      for (const t of body.tables) {
        if (t.id) {
          await ctx.c.tables.updateOne({ _id: oid(t.id), eventId }, { $set: { number: t.number, name: t.name ?? null, location: t.location ?? null, active: t.active } }, { session });
        } else {
          await ctx.c.tables.insertOne({ _id: new ObjectId(), eventId, number: t.number, name: t.name ?? null, location: t.location ?? null, active: t.active }, { session });
        }
      }
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: 'tables.update', entity: 'table', before: { count: current.length }, after: { count: body.tables.length }, ip: req.ip });
    }).catch((err) => {
      if (isDuplicateKey(err)) throw new AppError('VALIDATION_ERROR', 'Há números de mesa repetidos.');
      throw err;
    });
    const tables = await ctx.c.tables.find({ eventId }).sort({ number: 1 }).toArray();
    return { tables: tables.map(toTableView) };
  });

  // E41 · GET/PUT /admin/event (super admin) · RN16
  route(app, ctx, E41Get, async () => ({ event: toEventConfig(await loadEvent(ctx)) }));

  route(app, ctx, E41Put, async ({ req, body }) => {
    const next = await runTxn(ctx, async (session) => {
      const cur = await loadEvent(ctx, session);
      const slots = generateSlots({ date: body.date, timezone: body.timezone, startTime: body.startTime, endTime: body.endTime, slotMinutes: body.slotMinutes, gapMinutes: body.gapMinutes });
      if (slots.length === 0) throw new AppError('VALIDATION_ERROR', 'A grade não gera nenhum horário.');
      const locked = await ctx.c.appointments.countDocuments({ eventId: cur._id, slotLock: true }, { session });
      const check = checkGridChange(cur, body, locked);
      if (!check.ok) throw fromRuleError(check);
      const areaKeys = new Set(body.areas.map((a) => a.key));
      if (areaKeys.size !== body.areas.length) throw new AppError('VALIDATION_ERROR', 'Áreas com chave repetida.');
      const res = await ctx.c.events.findOneAndUpdate(
        { _id: cur._id, version: body.version },
        {
          $set: {
            name: body.name, date: body.date, location: body.location, timezone: body.timezone, startTime: body.startTime, endTime: body.endTime,
            slotMinutes: body.slotMinutes, gapMinutes: body.gapMinutes, slots: slots.map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })),
            responseWindowMinutes: body.responseWindowMinutes, minLeadMinutes: body.minLeadMinutes, registrationOpen: body.registrationOpen,
            areas: body.areas, templates: body.templates, updatedAt: ctx.now(),
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!res) throw new AppError('CONFLICT', 'A configuração foi alterada por outra pessoa. Recarregue.');
      // horários mudaram de lugar: a disponibilidade das mentoras só pode conter ids existentes
      const ids = slots.map((s) => s.id);
      await ctx.c.users.updateMany({ roles: 'mentor' }, { $pull: { availability: { $nin: ids } } }, { session });
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: 'event.update', entity: 'event', entityId: cur._id, before: { version: cur.version, registrationOpen: cur.registrationOpen }, after: { version: res.version, registrationOpen: res.registrationOpen }, ip: req.ip });
      return res;
    });
    return { event: toEventConfig(next) };
  });

  // E42 · GET /admin/event/qrcode.(png|svg)
  const signupUrl = () => `${ctx.config.publicBaseUrl}/mentoria/inscricao`;
  route(app, ctx, E42Png, async ({ reply }) => {
    const buf = await QRCode.toBuffer(signupUrl(), { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    void reply.header('Content-Type', 'image/png').header('Content-Disposition', 'inline; filename="qrcode-inscricao.png"').header('Cache-Control', 'no-store').send(buf);
    return RAW;
  });
  route(app, ctx, E42Svg, async ({ reply }) => {
    const svg = await QRCode.toString(signupUrl(), { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    void reply.header('Content-Type', 'image/svg+xml').header('Content-Disposition', 'inline; filename="qrcode-inscricao.svg"').header('Cache-Control', 'no-store').send(svg);
    return RAW;
  });

  // E43 · /admin/users (super admin) · mantém ao menos um super admin ativo
  route(app, ctx, E43List, async ({ query }) => {
    const filter: Record<string, unknown> = { roles: { $in: ['admin', 'super_admin'] } };
    if (query.status) filter['status'] = query.status;
    const users = await ctx.c.users.find(filter).sort({ name: 1 }).toArray();
    return { items: users.map(toUserView) };
  });

  route(app, ctx, E43Create, async ({ req, user, body }) => {
    const password = generateProvisionalPassword();
    const now = ctx.now();
    const doc: UserDoc = {
      _id: new ObjectId(), name: body.name, email: body.email, roles: [...new Set(body.roles)], passwordHash: await hashPassword(password), mustChangePassword: true, status: 'active',
      linkedin: null, organization: null, areas: [], bio: null, photoUrl: null, availability: [], lastLoginAt: null, failedLogins: 0, failedLoginWindowStart: null, lockedUntil: null,
      passwordChangedAt: null, passwordResetCount: body.sendPasswordByEmail ? 1 : 0, createdBy: user._id, createdAt: now, updatedAt: now,
    };
    try {
      await runTxn(ctx, async (session) => {
        await ctx.c.users.insertOne(doc, { session });
        if (body.sendPasswordByEmail) await enqueueStaffPassword(ctx, session, doc, 1, password);
        await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: 'user.create', entity: 'user', entityId: doc._id, after: { email: doc.email, roles: doc.roles }, ip: req.ip });
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw new AppError('EMAIL_TAKEN', 'Já existe uma conta com esse e-mail.');
      throw err;
    }
    return respond(201, { user: toUserView(doc), provisionalPassword: password });
  });

  route(app, ctx, E43Patch, async ({ req, user, params, body }) => {
    const id = oid(params.id);
    const password = body.resetPassword ? generateProvisionalPassword() : null;
    const hash = password ? await hashPassword(password) : null;
    const updated = await runTxn(ctx, async (session) => {
      const target = await ctx.c.users.findOne({ _id: id, roles: { $in: ['admin', 'super_admin'] } }, { session });
      if (!target) throw notFound('Usuário');
      const set: Record<string, unknown> = { updatedAt: ctx.now() };
      if (body.name !== undefined) set['name'] = body.name;
      let nextRoles = target.roles;
      if (body.roles !== undefined) {
        // preserva o papel de mentora, troca só admin/super_admin
        nextRoles = [...target.roles.filter((r) => r === 'mentor'), ...new Set(body.roles)];
        set['roles'] = nextRoles;
      }
      const nextStatus = body.status ?? target.status;
      if (body.status !== undefined) set['status'] = body.status;
      const selfDemotion = id.equals(user._id) && target.roles.includes('super_admin') && (!nextRoles.includes('super_admin') || nextStatus !== 'active');
      if (selfDemotion) throw new AppError('FORBIDDEN', 'Você não pode remover o próprio papel nem desativar a própria conta.');
      const supers = await ctx.c.users.find({ roles: 'super_admin' }, { session, projection: { roles: 1, status: 1 } }).toArray();
      const inv = checkSuperAdminInvariant(supers.map((u) => ({ id: String(u._id), roles: u.roles, status: u.status })), { userId: String(id), roles: nextRoles, status: nextStatus });
      if (!inv.ok) throw fromRuleError(inv);
      let n = target.passwordResetCount;
      if (hash) {
        set['passwordHash'] = hash;
        set['mustChangePassword'] = true;
        set['passwordChangedAt'] = null;
        set['failedLogins'] = 0;
        set['failedLoginWindowStart'] = null;
        set['lockedUntil'] = null;
        n += 1;
        set['passwordResetCount'] = n;
      }
      const after = await ctx.c.users.findOneAndUpdate({ _id: id }, { $set: set }, { session, returnDocument: 'after' });
      if (nextStatus === 'disabled' || hash) await ctx.c.sessions.deleteMany({ userId: id }, { session });
      else if (body.roles !== undefined) await ctx.c.sessions.deleteMany({ userId: id }, { session });
      if (hash && password && body.sendPasswordByEmail && after) await enqueueStaffPassword(ctx, session, after, n, password);
      await writeAudit(ctx, session, { actor: actorForRoute(req, 'admin'), action: hash ? 'user.reset_password' : 'user.update', entity: 'user', entityId: id, before: { roles: target.roles, status: target.status }, after: { roles: after?.roles, status: after?.status }, ip: req.ip });
      return after!;
    });
    return { user: toUserView(updated), provisionalPassword: password };
  });

  // E44 · notificações
  route(app, ctx, E44List, async ({ query }) => {
    const filter: Record<string, unknown> = { eventId: ctx.config.eventId };
    if (query.status) filter['status'] = query.status;
    if (query.channel) filter['channel'] = query.channel;
    if (query.type) filter['type'] = query.type;
    const cur = decodeCursor<{ t: number; id: string }>(query.cursor);
    if (cur) {
      const t = new Date(cur.t);
      filter['$and'] = [{ $or: [{ createdAt: { $lt: t } }, { createdAt: t, _id: { $lt: oid(cur.id) } }] }];
    }
    const limit = 50;
    const docs = await ctx.c.outbox.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const page = docs.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page.map(toOutboxItemView), nextCursor: docs.length > limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: String(last._id) }) : null };
  });

  route(app, ctx, E44Retry, async ({ req, params }) => {
    const id = oid(params.id);
    const now = ctx.now();
    const item = await ctx.c.outbox.findOneAndUpdate(
      { _id: id, status: 'failed' },
      { $set: { status: 'pending', attempts: 0, nextAttemptAt: now, lockedAt: null, lockedBy: null, lastError: null } },
      { returnDocument: 'after' },
    );
    if (!item) {
      const exists = await ctx.c.outbox.countDocuments({ _id: id });
      if (!exists) throw notFound('Notificação');
      throw new AppError('INVALID_STATE', 'Só é possível reenviar notificações que falharam.');
    }
    await writeAudit(ctx, undefined, { actor: actorForRoute(req, 'admin'), action: 'notification.retry', entity: 'outbox', entityId: id, ip: req.ip });
    return { item: toOutboxItemView(item) };
  });

  // E45 · auditoria
  route(app, ctx, E45, async ({ query }) => {
    const filter: Record<string, unknown> = { eventId: ctx.config.eventId };
    if (query.actorId) filter['actorId'] = oid(query.actorId);
    if (query.action) filter['action'] = query.action;
    if (query.entity) filter['entity'] = query.entity;
    const range: Record<string, Date> = {};
    if (query.from) range['$gte'] = new Date(query.from);
    if (query.to) range['$lte'] = new Date(query.to);
    if (Object.keys(range).length) filter['at'] = range;
    const cur = decodeCursor<{ t: number; id: string }>(query.cursor);
    if (cur) {
      const t = new Date(cur.t);
      filter['$and'] = [{ $or: [{ at: { ...range, $lt: t } }, { at: t, _id: { $lt: oid(cur.id) } }] }];
      delete filter['at'];
    }
    const limit = 50;
    const docs = await ctx.c.auditLogs.find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).toArray();
    const page = docs.slice(0, limit);
    const names = await ctx.c.users.find({ _id: { $in: page.map((p) => p.actorId).filter((x): x is ObjectId => !!x) } }, { projection: { name: 1 } }).toArray();
    const nn = new Map(names.map((u) => [String(u._id), u.name]));
    const last = page[page.length - 1];
    return {
      items: page.map((a) => ({ id: String(a._id), at: iso(a.at), actorId: a.actorId ? String(a.actorId) : null, actorName: a.actorId ? nn.get(String(a.actorId)) ?? null : null, actorRole: a.actorRole, action: a.action, entity: a.entity, entityId: a.entityId, before: a.before ?? null, after: a.after ?? null, ip: a.ip })),
      nextCursor: docs.length > limit && last ? encodeCursor({ t: last.at.getTime(), id: String(last._id) }) : null,
    };
  });
}
