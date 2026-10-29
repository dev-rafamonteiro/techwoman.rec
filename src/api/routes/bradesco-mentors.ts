import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { zonedTimeToUtc, E49AdminCreate, E49AdminList, E49Public, E50, E51, type BradescoMentorView } from '@tw/shared';
import type { BradescoMentorDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, isDuplicateKey } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { normalizePhoneBR } from '../lib/normalize.js';
import { normalizeEmail } from '../domain/registration.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { respond, route } from '../lib/route.js';

function toView(mentor: BradescoMentorDoc, reserved: ReadonlySet<string>): BradescoMentorView {
  return {
    id: String(mentor._id),
    name: mentor.name,
    expertise: mentor.expertise,
    city: mentor.city,
    linkedin: mentor.linkedin,
    bio: mentor.bio,
    photoUrl: mentor.photoUrl,
    themes: mentor.themes,
    active: mentor.active,
    slots: mentor.slots.map((slot) => ({ ...slot, available: mentor.active && !reserved.has(`${mentor._id}:${slot.id}`) })),
  };
}

export function registerBradescoMentorRoutes(app: FastifyInstance, ctx: AppContext): void {
  route(app, ctx, E49Public, async () => {
    const event = await loadEvent(ctx);
    const now = ctx.now();
    const lastSlot = event.slots[event.slots.length - 1];
    const reservationsOpen = event.registrationOpen && !!lastSlot && now.getTime() < lastSlot.startAt.getTime();
    const mentors = await ctx.c.bradescoMentors.find({ active: true }).sort({ name: 1 }).toArray();
    const reservations = await ctx.c.bradescoReservations
      .find({ eventId: event._id, mentorId: { $in: mentors.map((mentor) => mentor._id) } }, { projection: { mentorId: 1, slotId: 1 } })
      .toArray();
    const reserved = new Set(reservations.map((item) => `${item.mentorId}:${item.slotId}`));
    return {
      eventDate: event.date,
      consentVersion: event.consentVersion,
      items: mentors.map((mentor) => {
        const view = toView(mentor, reserved);
        const { active: _active, ...publicView } = view;
        return {
          ...publicView,
          slots: publicView.slots
            .filter((slot) => zonedTimeToUtc(event.date, slot.id, event.timezone).getTime() > now.getTime())
            .map((slot) => ({
              ...slot,
              available: slot.available && reservationsOpen,
              reserved: reserved.has(`${mentor._id}:${slot.id}`),
            })),
        };
      }),
    };
  });

  route(app, ctx, E49AdminList, async () => {
    const event = await loadEvent(ctx);
    const mentors = await ctx.c.bradescoMentors.find({}).sort({ name: 1 }).toArray();
    const reservations = await ctx.c.bradescoReservations
      .find({ eventId: event._id }, { projection: { mentorId: 1, slotId: 1 } })
      .toArray();
    const reserved = new Set(reservations.map((item) => `${item.mentorId}:${item.slotId}`));
    return { items: mentors.map((mentor) => toView(mentor, reserved)) };
  });

  route(app, ctx, E49AdminCreate, async ({ body, req }) => {
    const now = ctx.now();
    const doc: BradescoMentorDoc = {
      _id: new ObjectId(),
      ...body,
      scheduleVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await runTxn(ctx, async (session) => {
        await ctx.c.bradescoMentors.insertOne(doc, { session });
        await writeAudit(ctx, session, {
          actor: actorForRoute(req, 'admin'),
          action: 'bradesco_mentor.create',
          entity: 'bradesco_mentor',
          entityId: doc._id,
          after: { name: doc.name, active: doc.active, slots: doc.slots.length },
          ip: req.ip,
        });
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'Já existe uma mentora Bradesco com esse nome.');
      throw error;
    }
    return respond(201, { item: toView(doc, new Set()) });
  });

  route(app, ctx, E51, async ({ params, body, req }) => {
    if (!ObjectId.isValid(params.id)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    const id = new ObjectId(params.id);
    const event = await loadEvent(ctx);
    const existing = await ctx.c.bradescoMentors.findOne({ _id: id });
    if (!existing) throw new AppError('NOT_FOUND', 'Mentora não encontrada.');
    const reservations = await ctx.c.bradescoReservations.find({ eventId: event._id, mentorId: id }).toArray();
    const reserved = new Set(reservations.map((item) => item.slotId));
    const nextSlots = new Set(body.slots.map((slot) => slot.id));
    const removedBookings = [...reserved].filter((slotId) => !nextSlots.has(slotId));
    if (removedBookings.length || (!body.active && reserved.size)) {
      throw new AppError('SLOT_IN_USE', 'Não é possível remover horários ou desativar uma mentora com reservas confirmadas.', {
        details: { slotIds: removedBookings.length ? removedBookings : [...reserved] },
      });
    }
    const now = ctx.now();
    const updated: BradescoMentorDoc = { ...existing, ...body, _id: id, createdAt: existing.createdAt, updatedAt: now };
    await runTxn(ctx, async (session) => {
      const result = await ctx.c.bradescoMentors.replaceOne(
        { _id: id, updatedAt: existing.updatedAt, scheduleVersion: existing.scheduleVersion },
        updated,
        { session },
      );
      if (result.matchedCount !== 1) throw new AppError('CONFLICT', 'A mentora foi atualizada por outra pessoa. Recarregue e tente novamente.');
      await writeAudit(ctx, session, {
        actor: actorForRoute(req, 'admin'),
        action: 'bradesco_mentor.update',
        entity: 'bradesco_mentor',
        entityId: id,
        before: { name: existing.name, active: existing.active, slots: existing.slots.length },
        after: { name: updated.name, active: updated.active, slots: updated.slots.length },
        ip: req.ip,
      });
    });
    return { item: toView(updated, new Set([...reserved].map((slotId) => `${id}:${slotId}`))) };
  });

  route(app, ctx, E50, async ({ body, req }) => {
    await verifyTurnstile(ctx.config, body.turnstileToken, req.ip);
    const mentorId = new ObjectId(body.mentorId);
    const now = ctx.now();
    const phone = normalizePhoneBR(body.phone);
    if (!phone) throw new AppError('VALIDATION_ERROR', 'Telefone inválido. Informe DDD e número.', { details: { field: 'phone' } });

    let result: { mentorName: string; slotTime: string; topic: string; eventDate: string };
    try {
      result = await runTxn(ctx, async (session) => {
        const event = await loadEvent(ctx, session);
        const lastSlot = event.slots[event.slots.length - 1];
        if (!event.registrationOpen || !lastSlot || now.getTime() >= lastSlot.startAt.getTime()) {
          throw new AppError('REGISTRATION_CLOSED', 'As reservas estão encerradas.');
        }
        if (body.consent.version !== event.consentVersion) {
          throw new AppError('VALIDATION_ERROR', 'O aviso de privacidade foi atualizado. Recarregue a página e tente novamente.');
        }
        const mentor = await ctx.c.bradescoMentors.findOne({ _id: mentorId, active: true }, { session });
        const slot = mentor?.slots.find((item) => item.id === body.slotId);
        if (!mentor || !slot) throw new AppError('SLOT_UNAVAILABLE', 'Esse horário não está mais disponível. Atualize as opções.');
        if (zonedTimeToUtc(event.date, slot.id, event.timezone).getTime() <= now.getTime()) {
          throw new AppError('SLOT_UNAVAILABLE', 'Esse horário já passou. Escolha outro.');
        }
        const locked = await ctx.c.bradescoMentors.updateOne(
          { _id: mentorId, active: true, scheduleVersion: mentor.scheduleVersion, 'slots.id': slot.id },
          { $set: { updatedAt: now }, $inc: { scheduleVersion: 1 } },
          { session },
        );
        if (locked.matchedCount !== 1) throw new AppError('SLOT_UNAVAILABLE', 'As opções foram atualizadas. Escolha outro horário.');
        const reservation = {
          _id: new ObjectId(),
          eventId: event._id,
          mentorId,
          slotId: slot.id,
          name: body.name,
          email: normalizeEmail(body.email),
          phone,
          consentVersion: body.consent.version,
          consentAt: now,
          createdAt: now,
        };
        try {
          await ctx.c.bradescoReservations.insertOne(reservation, { session });
        } catch (error) {
          if (isDuplicateKey(error)) throw new AppError('SLOT_UNAVAILABLE', 'Esse horário acabou de ser reservado. Escolha outro.');
          throw error;
        }
        await writeAudit(ctx, session, {
          actor: { userId: null, role: 'mentee' },
          action: 'bradesco_mentor.reserve',
          entity: 'bradesco_reservation',
          entityId: reservation._id,
          after: { mentorId: String(mentorId), slotId: slot.id },
          ip: req.ip,
        });
        return { mentorName: mentor.name, slotTime: slot.time, topic: slot.topic, eventDate: event.date };
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError('SLOT_UNAVAILABLE', 'Esse horário acabou de ser reservado. Escolha outro.');
      throw error;
    }
    return respond(201, result);
  }, { rateLimit: { max: 5, timeWindow: '1 minute' } });
}
