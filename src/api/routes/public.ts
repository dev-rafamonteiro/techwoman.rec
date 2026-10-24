import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E01, E02, E03, E04, E05, E06, E07, E08, type E01Response } from '@tw/shared';
import { hashMenteeToken, menteeToken, personalPath } from '../lib/tokens.js';
import type { MenteeDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, isDuplicateKey } from '../lib/errors.js';
import { RAW, respond, route } from '../lib/route.js';
import { findMenteeByToken } from '../lib/mentee-auth.js';
import { buildIcs, ICS_FILENAME, icsIdentity } from '../notifications/ics.js';
import { writeAudit } from '../lib/audit.js';
import { normalizeLinkedin, normalizePhoneBR } from '../lib/normalize.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { buildMenteeState } from '../services/mentee-state.js';
import { listSelfBookSlots, selfBook } from '../services/self-book.js';
import { applyTransition } from '../services/transitions.js';
import { canUpdatePreferredPeriod, isRegistrationOpen, normalizeEmail, registrationOutcome } from '../domain/index.js';

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E01 · GET /public/event
  route(app, ctx, E01, async () => {
    const ev = await loadEvent(ctx);
    const last = ev.slots[ev.slots.length - 1];
    const body: E01Response = {
      name: ev.name,
      date: ev.date,
      location: ev.location,
      timezone: ev.timezone,
      startTime: ev.startTime,
      endTime: ev.endTime,
      slotMinutes: ev.slotMinutes,
      responseWindowMinutes: ev.responseWindowMinutes,
      registrationOpen: ev.registrationOpen && !!last && ctx.now().getTime() < last.startAt.getTime(),
      areas: ev.areas,
      periods: [
        { key: 'morning', label: 'Manhã', from: ev.startTime, to: '12:00' },
        { key: 'early_afternoon', label: 'Início da tarde', from: '12:00', to: '15:00' },
        { key: 'late_afternoon', label: 'Fim da tarde', from: '15:00', to: ev.endTime },
        { key: 'any', label: 'Qualquer horário', from: null, to: null },
      ],
      consentVersion: ev.consentVersion,
    };
    return body;
  });

  // E02 · POST /public/mentees · RN01, RN02
  route(
    app,
    ctx,
    E02,
    async ({ req, body }) => {
      await verifyTurnstile(ctx.config, body.turnstileToken, req.ip);
      const event = await loadEvent(ctx);
      const phone = normalizePhoneBR(body.phone);
      if (!phone) throw new AppError('VALIDATION_ERROR', 'Telefone inválido. Informe DDD e número.', { details: { field: 'phone' } });
      const linkedin = normalizeLinkedin(body.linkedin);
      if (linkedin === undefined && body.linkedin !== undefined) {
        throw new AppError('VALIDATION_ERROR', 'LinkedIn inválido.', { details: { field: 'linkedin' } });
      }
      if (!event.areas.some((a) => a.key === body.area)) {
        throw new AppError('VALIDATION_ERROR', 'Área desconhecida.', { details: { field: 'area' } });
      }
      const now = ctx.now();
      const emailNorm = normalizeEmail(body.email);
      const last = event.slots[event.slots.length - 1] ?? null;
      const open = isRegistrationOpen({ registrationOpen: event.registrationOpen, lastSlotStartAt: last?.startAt ?? null }, now);

      const existing = await ctx.c.mentees.findOne({ eventId: ctx.config.eventId, emailNorm });
      const outcome = registrationOutcome(existing);
      if (outcome !== 'resend_link' && !open) {
        throw new AppError('REGISTRATION_CLOSED', 'As inscrições estão encerradas.');
      }

      const resend = async (m: MenteeDoc) => {
        await runTxn(ctx, async (session) => {
          const upd = await ctx.c.mentees.findOneAndUpdate({ _id: m._id }, { $inc: { linkSendCount: 1 } }, { session, returnDocument: 'after' });
          if (!upd) return;
          await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: upd, dedupeSuffix: upd.linkSendCount });
        });
        return respond(200, {
          status: 'already_registered' as const,
          code: 'ALREADY_REGISTERED' as const,
          message: 'Você já tem uma inscrição. Enviamos de novo o link da sua página para seu e-mail.',
        });
      };

      if (outcome === 'resend_link' && existing) return resend(existing);

      const fields = {
        name: body.name,
        email: body.email,
        phone,
        linkedin: linkedin ?? null,
        area: body.area,
        preferredPeriod: body.preferredPeriod,
        note: body.note ? body.note : null,
        quizScores: body.quizScores ?? {},
        consent: { version: body.consent.version, acceptedAt: now },
      };

      if (outcome === 'reactivate' && existing) {
        const updated = await runTxn(ctx, async (session) => {
          const m = await ctx.c.mentees.findOneAndUpdate(
            { _id: existing._id, status: { $in: ['cancelled', 'no_show'] } },
            {
              $set: {
                ...fields,
                status: 'waiting',
                priority: false,
                priorityReason: null,
                queuedAt: now,
                currentAppointmentId: null,
                lastOutcome: null,
                updatedAt: now,
              },
              $inc: { linkSendCount: 1, version: 1 },
            },
            { session, returnDocument: 'after' },
          );
          if (!m) return null;
          await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: m, dedupeSuffix: m.linkSendCount });
          await writeAudit(ctx, session, { actor: { userId: null, role: 'mentee' }, action: 'mentee.register', entity: 'mentee', entityId: m._id, before: { status: existing.status }, after: { status: 'waiting' }, ip: req.ip });
          return m;
        });
        if (!updated) {
          const again = await ctx.c.mentees.findOne({ _id: existing._id });
          if (again) return resend(again);
          throw new AppError('CONFLICT', 'Tente novamente.');
        }
        const token = menteeToken(ctx.config.menteeTokenSecret, updated._id, updated.tokenVersion);
        return respond(201, { status: 'created' as const, token, personalPath: personalPath(token) });
      }

      // create
      const _id = new ObjectId();
      const token = menteeToken(ctx.config.menteeTokenSecret, _id, 1);
      const doc: MenteeDoc = {
        _id,
        eventId: ctx.config.eventId,
        ...fields,
        status: 'waiting',
        priority: false,
        priorityReason: null,
        queuedAt: now,
        currentAppointmentId: null,
        lastOutcome: null,
        emailNorm,
        tokenHash: hashMenteeToken(token),
        tokenVersion: 1,
        linkSendCount: 1,
        anonymizedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await runTxn(ctx, async (session) => {
          await ctx.c.mentees.insertOne(doc, { session });
          await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: doc, dedupeSuffix: 1 });
          await writeAudit(ctx, session, { actor: { userId: null, role: 'mentee' }, action: 'mentee.register', entity: 'mentee', entityId: _id, after: { status: 'waiting', area: doc.area }, ip: req.ip });
        });
      } catch (err) {
        if (isDuplicateKey(err)) {
          // corrida: outra requisição com o mesmo e-mail venceu
          const winner = await ctx.c.mentees.findOne({ eventId: ctx.config.eventId, emailNorm });
          if (winner) return resend(winner);
        }
        throw err;
      }
      return respond(201, { status: 'created' as const, token, personalPath: personalPath(token) });
    },
    { rateLimit: { max: 300, timeWindow: '10 minutes' } },
  );

  // E03 · GET /public/me
  route(app, ctx, E03, async ({ mentee }) => buildMenteeState(ctx, mentee));

  // E06 · GET /public/calendar.ics?t=<token> · só mentoria confirmada
  route(
    app,
    ctx,
    E06,
    async ({ reply, query }) => {
      const mentee = await findMenteeByToken(ctx, query.t);
      const notFound = () => new AppError('NOT_FOUND', 'Não há mentoria confirmada para adicionar à agenda.');
      const appt = mentee.currentAppointmentId ? await ctx.c.appointments.findOne({ _id: mentee.currentAppointmentId, menteeId: mentee._id }) : null;
      if (!appt || (appt.status !== 'confirmed' && appt.status !== 'in_progress')) throw notFound();
      const [event, mentor, table, ics] = await Promise.all([
        loadEvent(ctx),
        ctx.c.users.findOne({ _id: appt.mentorId }, { projection: { name: 1 } }),
        ctx.c.tables.findOne({ _id: appt.tableId }),
        icsIdentity(ctx.c.appointments, appt),
      ]);
      if (!mentor || !table) throw notFound();
      void reply
        .header('Content-Type', 'text/calendar; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${ICS_FILENAME}"`)
        .header('Cache-Control', 'no-store')
        .send(buildIcs({ appointment: appt, event, mentor, table, ...ics }));
      return RAW;
    },
    { rateLimit: { max: 60, timeWindow: '1 minute' } },
  );

  // E04 · POST /public/me/actions · RN06, RN14, RN19
  route(app, ctx, E04, async ({ req, mentee, body, idem }) => {
    const actor = { userId: null, role: 'mentee' as const };
    const apptId = mentee.currentAppointmentId;
    const result = await runTxn(ctx, async (session) => {
      const fresh = await ctx.c.mentees.findOne({ _id: mentee._id }, { session });
      if (!fresh) throw new AppError('NOT_FOUND', 'Não encontramos sua inscrição.');
      switch (body.action) {
        case 'accept':
        case 'decline': {
          const id = fresh.currentAppointmentId ?? apptId;
          if (!id) {
            if (fresh.lastOutcome === 'expired') throw new AppError('INVITE_EXPIRED', 'O prazo para responder terminou.');
            throw new AppError('INVALID_STATE', 'Não há convite para responder.');
          }
          await applyTransition(ctx, session, {
            appointmentId: id,
            action: body.action === 'accept' ? 'accept' : body.reason === 'schedule' ? 'decline_schedule' : 'decline_no_interest',
            actor,
            scope: { menteeId: fresh._id },
            ip: req.ip,
          });
          break;
        }
        case 'cancel': {
          if (fresh.currentAppointmentId && (fresh.status === 'invited' || fresh.status === 'confirmed')) {
            await applyTransition(ctx, session, { appointmentId: fresh.currentAppointmentId, action: 'mentee_cancel', actor, scope: { menteeId: fresh._id }, ip: req.ip });
          } else if (fresh.status === 'waiting') {
            await ctx.c.mentees.updateOne({ _id: fresh._id, status: 'waiting' }, { $set: { status: 'cancelled', updatedAt: ctx.now() }, $inc: { version: 1 } }, { session });
            await writeAudit(ctx, session, { actor, action: 'mentee.cancel', entity: 'mentee', entityId: fresh._id, before: { status: 'waiting' }, after: { status: 'cancelled' }, ip: req.ip });
          } else {
            throw new AppError('INVALID_STATE', 'Não é possível cancelar nesta situação.');
          }
          break;
        }
        case 'reschedule': {
          // RN19 · só de `confirmed`: cancela a mentoria e volta à fila com prioridade
          if (fresh.status !== 'confirmed' || !fresh.currentAppointmentId) {
            throw new AppError('INVALID_STATE', 'Só é possível trocar de horário com a mentoria confirmada.');
          }
          await applyTransition(ctx, session, { appointmentId: fresh.currentAppointmentId, action: 'mentee_reschedule', actor, scope: { menteeId: fresh._id }, ip: req.ip });
          break;
        }
        case 'update_preference': {
          if (!canUpdatePreferredPeriod(fresh.status)) {
            throw new AppError('INVALID_STATE', 'O período só pode ser alterado enquanto você aguarda uma mentora.');
          }
          await ctx.c.mentees.updateOne({ _id: fresh._id, status: 'waiting' }, { $set: { preferredPeriod: body.preferredPeriod, updatedAt: ctx.now() }, $inc: { version: 1 } }, { session });
          break;
        }
      }
      const after = await ctx.c.mentees.findOne({ _id: fresh._id }, { session });
      const state = await buildMenteeState(ctx, after!, session);
      await idem?.markDone(session, { status: 200, body: state });
      return state;
    });
    return result;
  });

  // E07 · GET /public/me/slots · RN19
  route(app, ctx, E07, async ({ mentee }) => listSelfBookSlots(ctx, mentee));

  // E08 · POST /public/me/book · RN19
  route(app, ctx, E08, async ({ req, mentee, body, idem }) =>
    runTxn(ctx, async (session) => {
      const { mentee: after } = await selfBook(ctx, session, { menteeId: mentee._id, slotId: body.slotId, ip: req.ip });
      const state = await buildMenteeState(ctx, after, session);
      await idem?.markDone(session, { status: 200, body: state });
      return state;
    }),
  );

  // E05 · POST /public/resend-link · sempre 202 (sem enumeração)
  route(
    app,
    ctx,
    E05,
    async ({ req, body }) => {
      await verifyTurnstile(ctx.config, body.turnstileToken, req.ip);
      const m = await ctx.c.mentees.findOne({ eventId: ctx.config.eventId, emailNorm: normalizeEmail(body.email) });
      if (m && m.status !== 'cancelled' && m.status !== 'no_show') {
        try {
          await runTxn(ctx, async (session) => {
            const upd = await ctx.c.mentees.findOneAndUpdate({ _id: m._id }, { $inc: { linkSendCount: 1 } }, { session, returnDocument: 'after' });
            if (upd) await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: upd, dedupeSuffix: upd.linkSendCount });
          });
        } catch (err) {
          ctx.log.warn({ err }, 'E05: falha ao enfileirar reenvio');
        }
      }
      return respond(202, { ok: true as const });
    },
    { rateLimit: { max: 300, timeWindow: '10 minutes' } },
  );
}
