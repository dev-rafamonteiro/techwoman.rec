import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E52, E53, E54, type ExtraSessionView } from '@tw/shared';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import type { ExtraSessionDoc, MenteeDoc } from '@tw/db';
import { AppError, isDuplicateKey, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { normalizeLinkedin, parseOptionalPhone } from '../lib/normalize.js';
import { hashMenteeToken, menteeToken } from '../lib/tokens.js';
import { normalizeEmail } from '../domain/registration.js';
import { route, respond } from '../lib/route.js';
import { iso, toMenteeStaffView } from '../lib/views.js';

const view = (session: ExtraSessionDoc): ExtraSessionView => ({
  id: String(session._id),
  slotId: session.slotId,
  startAt: iso(session.startAt),
  endAt: iso(session.endAt),
  mentee: { id: String(session.menteeId), name: session.mentee.name, area: session.mentee.area },
  createdAt: iso(session.createdAt),
});

export function registerMentorExtraSessionRoutes(app: FastifyInstance, ctx: AppContext): void {
  route(app, ctx, E52, async ({ query }) => {
    const event = await loadEvent(ctx);
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentees = await ctx.c.mentees.find(
      { eventId: event._id, anonymizedAt: null, name: { $regex: escaped, $options: 'i' } },
      { projection: { name: 1, area: 1, preferredPeriod: 1, linkedin: 1, note: 1, priority: 1, priorityReason: 1, status: 1, queuedAt: 1 } },
    ).sort({ name: 1 }).limit(20).toArray();
    return { items: mentees.map(toMenteeStaffView) };
  });

  route(app, ctx, E53, async ({ req, user, body, idem }) => {
    const event = await loadEvent(ctx);
    const slot = event.slots.find((item) => item.id === body.slotId);
    if (!slot) throw new AppError('VALIDATION_ERROR', 'Esse horário não faz parte do evento.');
    if (slot.endAt.getTime() > ctx.now().getTime()) {
      throw new AppError('INVALID_STATE', 'Só é possível registrar uma sessão depois que o horário terminou.');
    }

    let saved: ExtraSessionDoc;
    try {
      saved = await runTxn(ctx, async (session) => {
        let mentee: MenteeDoc;
        let attendee: ExtraSessionDoc['mentee'];
        if (body.type === 'existing') {
          const found = await ctx.c.mentees.findOne(
            { _id: new ObjectId(body.menteeId), eventId: event._id, anonymizedAt: null },
            { session },
          );
          if (!found) throw notFound('Mentorada');
          mentee = found;
          attendee = {
            name: mentee.name,
            email: null,
            phone: null,
            linkedin: mentee.linkedin,
            area: mentee.area,
            preferredPeriod: mentee.preferredPeriod,
            note: mentee.note,
            consent: null,
          };
        } else {
          const input = body.attendee;
          if (!event.areas.some((area) => area.key === input.area)) throw new AppError('VALIDATION_ERROR', 'Área desconhecida.');
          const email = input.email.trim();
          const emailNorm = normalizeEmail(email);
          const existing = await ctx.c.mentees.findOne({ eventId: event._id, emailNorm }, { session, projection: { _id: 1 } });
          if (existing) throw new AppError('INVALID_STATE', 'Já existe uma inscrição com esse e-mail. Busque e selecione a mentorada cadastrada.');
          const linkedin = input.linkedin ? normalizeLinkedin(input.linkedin) : null;
          if (linkedin === undefined) throw new AppError('VALIDATION_ERROR', 'Informe um perfil do LinkedIn válido.');
          const now = ctx.now();
          const menteeId = new ObjectId();
          const token = menteeToken(ctx.config.menteeTokenSecret, menteeId, 1);
          mentee = {
            _id: menteeId,
            eventId: event._id,
            name: input.name,
            email,
            emailNorm,
            phone: parseOptionalPhone(input.phone) ?? null,
            linkedin: linkedin ?? null,
            area: input.area,
            quizScores: {},
            preferredPeriod: input.preferredPeriod,
            note: input.note ?? null,
            consent: { version: event.consentVersion, acceptedAt: now },
            status: 'done',
            priority: false,
            priorityReason: null,
            queuedAt: now,
            currentAppointmentId: null,
            lastOutcome: null,
            tokenHash: hashMenteeToken(token),
            tokenVersion: 1,
            linkSendCount: 0,
            anonymizedAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          await ctx.c.mentees.insertOne(mentee, { session });
          attendee = {
            name: mentee.name,
            email: null,
            phone: null,
            linkedin: mentee.linkedin,
            area: input.area,
            preferredPeriod: input.preferredPeriod,
            note: mentee.note,
            consent: null,
          };
          await writeAudit(ctx, session, {
            actor: actorForRoute(req, 'mentor'),
            action: 'mentee.register_extra_session',
            entity: 'mentee',
            entityId: mentee._id,
            after: { status: 'done', area: mentee.area },
            ip: req.ip,
          });
        }

        const doc: ExtraSessionDoc = {
          _id: new ObjectId(),
          eventId: event._id,
          mentorId: user._id,
          menteeId: mentee._id,
          mentee: attendee,
          slotId: slot.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          createdAt: ctx.now(),
        };
        await ctx.c.extraSessions.insertOne(doc, { session });
        await writeAudit(ctx, session, {
          actor: actorForRoute(req, 'mentor'),
          action: 'extra_session.recorded',
          entity: 'extra_session',
          entityId: doc._id,
          after: { slotId: doc.slotId, menteeId: String(doc.menteeId), status: 'done' },
          ip: req.ip,
        });
        await idem?.markDone(session, { status: 201, body: view(doc) });
        return doc;
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError('INVALID_STATE', 'Já existe uma inscrição com esse e-mail. Busque e selecione a mentorada cadastrada.');
      }
      throw error;
    }
    return respond(201, view(saved));
  });

  route(app, ctx, E54, async ({ user }) => {
    const event = await loadEvent(ctx);
    const items = await ctx.c.extraSessions.find({ eventId: event._id, mentorId: user._id })
      .sort({ startAt: -1, createdAt: -1 }).limit(50).toArray();
    return { items: items.map(view) };
  });
}
