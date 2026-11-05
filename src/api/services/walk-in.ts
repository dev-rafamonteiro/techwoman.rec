import { ObjectId } from 'mongodb';
import type { E51Body, E51Response, MenteeStatus } from '@tw/shared';
import type { MenteeDoc, UserDoc, WalkInDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, isDuplicateKey, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { normalizePhoneBR } from '../lib/normalize.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import type { IdemHandle } from '../lib/idempotency.js';
import { iso, toMenteeStaffView } from '../lib/views.js';
import { isLiveMentee, normalizeEmail, walkInQueueEffect, type Actor } from '../domain/index.js';
import { insertNewMentee, newMenteeDoc, type MenteeFields } from './mentee-registration.js';

export const WALK_IN_DUPLICATE_MESSAGE = 'Você já registrou um atendimento fora da mesa com esta participante.';

export const toWalkInView = (w: WalkInDoc, mentee: MenteeDoc) => ({ id: String(w._id), at: iso(w.at), note: w.note, mentee: toMenteeStaffView(mentee) });

const keyPatternOf = (err: unknown): Record<string, unknown> => (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};

/**
 * RN21 · E51: registra o atendimento fora da mesa em uma transação: cadastro rápido (se for o caso), efeito na fila,
 * `walk_ins` e auditoria. Não cria mentoria nem usa mesa ou horário (RN16 e os índices de agenda não mudam).
 * Corrida no cadastro rápido com o mesmo e-mail (RN01): quem perde vê a inscrição vencedora na nova tentativa e o
 * atendimento vai para ela (`linked`).
 */
export async function createWalkIn(
  ctx: AppContext,
  input: { mentor: UserDoc; actor: Actor; body: E51Body; ip: string | null; idem: IdemHandle | undefined },
): Promise<E51Response> {
  const { mentor, actor, body, ip, idem } = input;
  const event = await loadEvent(ctx);
  const note = body.note ? body.note : null;

  let fields: MenteeFields | null = null;
  if ('newMentee' in body) {
    const nm = body.newMentee;
    if (!event.areas.some((a) => a.key === nm.area)) throw new AppError('VALIDATION_ERROR', 'Área desconhecida.', { details: { field: 'area' } });
    const phone = nm.phone ? normalizePhoneBR(nm.phone) : null;
    if (nm.phone && !phone) throw new AppError('VALIDATION_ERROR', 'Celular inválido. Informe DDD e número.', { details: { field: 'phone' } });
    fields = {
      name: nm.name,
      email: nm.email,
      phone,
      linkedin: null,
      area: nm.area,
      preferredPeriod: 'any',
      note: null,
      quizScores: {},
      consent: null, // preenchido com a hora da transação
    };
  }
  let menteeId: ObjectId | null = null;
  if ('menteeId' in body) {
    if (!ObjectId.isValid(body.menteeId)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    menteeId = new ObjectId(body.menteeId);
  }

  const attempt = () =>
    runTxn(ctx, async (session) => {
      const now = ctx.now();
      let mentee: MenteeDoc;
      let outcome: E51Response['outcome'];
      let previousStatus: MenteeStatus | null;

      if (menteeId) {
        const m = await ctx.c.mentees.findOne({ _id: menteeId, eventId: event._id }, { session });
        if (!m) throw notFound('Participante');
        mentee = m;
        outcome = 'existing';
        previousStatus = m.status;
      } else {
        const f = { ...fields!, consent: { version: event.consentVersion, acceptedAt: now, collectedBy: mentor._id } };
        const existing = await ctx.c.mentees.findOne({ eventId: event._id, emailNorm: normalizeEmail(f.email) }, { session });
        if (!existing) {
          // cadastro novo já concluído: ela acabou de ser atendida; recebe o link pessoal (P6) para avaliar
          mentee = newMenteeDoc(ctx, f, { status: 'done', now });
          await insertNewMentee(ctx, session, mentee, { actor, action: 'mentee.register_by_staff', ip, after: { walkIn: true } });
          outcome = 'created';
          previousStatus = null;
        } else if (!isLiveMentee(existing.status)) {
          // RN01: inscrição cancelada ou `no_show` com o mesmo e-mail volta, já concluída, com os dados novos e o link reenviado
          const m = await ctx.c.mentees.findOneAndUpdate(
            { _id: existing._id, status: { $in: ['cancelled', 'no_show'] } },
            {
              $set: { ...f, status: 'done', priority: false, priorityReason: null, currentAppointmentId: null, lastOutcome: null, updatedAt: now },
              $inc: { linkSendCount: 1, version: 1 },
            },
            { session, returnDocument: 'after' },
          );
          if (!m) throw new AppError('CONFLICT', 'A inscrição mudou. Tente de novo.');
          await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: m, dedupeSuffix: m.linkSendCount });
          await writeAudit(ctx, session, { actor, action: 'mentee.register_by_staff', entity: 'mentee', entityId: m._id, before: { status: existing.status }, after: { status: 'done', walkIn: true }, ip });
          mentee = m;
          outcome = 'reactivated';
          previousStatus = existing.status;
        } else {
          // RN01: o e-mail já está inscrito; o atendimento vai para a inscrição existente, sem e-mail
          mentee = existing;
          outcome = 'linked';
          previousStatus = existing.status;
        }
      }

      const dup = await ctx.c.walkIns.findOne({ eventId: event._id, mentorId: mentor._id, menteeId: mentee._id, deletedAt: null }, { session, projection: { _id: 1 } });
      if (dup) throw new AppError('CONFLICT', WALK_IN_DUPLICATE_MESSAGE);

      if (outcome === 'existing' || outcome === 'linked') {
        const effect = walkInQueueEffect(mentee.status);
        if (!effect.ok) throw new AppError('INVALID_STATE', 'Esta inscrição foi cancelada. Faça um cadastro novo.');
        if (effect.leavesQueue) {
          // saiu da fila: o Change Stream tira o card do M4 das outras mentoras
          const m = await ctx.c.mentees.findOneAndUpdate(
            { _id: mentee._id, status: 'waiting' },
            { $set: { status: effect.next, updatedAt: now }, $inc: { version: 1 } },
            { session, returnDocument: 'after' },
          );
          if (!m) throw new AppError('CONFLICT', 'A participante acabou de mudar de situação. Busque de novo.');
          await writeAudit(ctx, session, { actor, action: 'mentee.walk_in_done', entity: 'mentee', entityId: m._id, before: { status: 'waiting' }, after: { status: 'done' }, ip });
          mentee = m;
        }
      }

      const walkIn: WalkInDoc = {
        _id: new ObjectId(),
        eventId: event._id,
        menteeId: mentee._id,
        mentorId: mentor._id,
        at: now,
        note,
        previousMenteeStatus: previousStatus,
        createdBy: mentor._id,
        createdAt: now,
        deletedAt: null,
        deletedBy: null,
      };
      await ctx.c.walkIns.insertOne(walkIn, { session });
      await writeAudit(ctx, session, {
        actor,
        action: 'walk_in.create',
        entity: 'walk_in',
        entityId: walkIn._id,
        after: { menteeId: String(mentee._id), outcome, previousStatus, status: mentee.status, note: note !== null },
        ip,
      });
      const res: E51Response = {
        walkIn: toWalkInView(walkIn, mentee),
        outcome,
        linkedExisting: outcome === 'linked',
        name: mentee.name,
        previousStatus,
        status: mentee.status,
      };
      await idem?.markDone(session, { status: 201, body: res });
      return res;
    });

  // duplicate key não é erro transitório: a transação aborta e não repete sozinha
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const kp = keyPatternOf(err);
      if ('mentorId' in kp) throw new AppError('CONFLICT', WALK_IN_DUPLICATE_MESSAGE);
      // corrida no cadastro rápido (mesmo e-mail): a nova tentativa encontra a inscrição vencedora
      if ('emailNorm' in kp && i < 2) continue;
      throw err;
    }
  }
}
