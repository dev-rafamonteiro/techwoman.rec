import { ObjectId, type ClientSession } from 'mongodb';
import type { E51Body, E51Response, MenteeStatus, ScheduledTable } from '@tw/shared';
import type { AppointmentDoc, MenteeDoc, UserDoc, WalkInDoc } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, isDuplicateKey, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { normalizePhoneBR } from '../lib/normalize.js';
import { enqueueWalkInNotification } from '../lib/outbox.js';
import { tableLabel } from '../notifications/ics.js';
import type { IdemHandle } from '../lib/idempotency.js';
import { iso, toMenteeStaffView } from '../lib/views.js';
import { isActiveAppointment, isLiveMentee, normalizeEmail, walkInEffect, type Actor } from '../domain/index.js';
import { applyTransition } from './transitions.js';
import { insertNewMentee, newMenteeDoc, type MenteeFields } from './mentee-registration.js';

export const WALK_IN_DUPLICATE_MESSAGE = 'Você já registrou um atendimento fora da mesa com esta participante.';

export const toWalkInView = (w: WalkInDoc, mentee: MenteeDoc) => ({ id: String(w._id), at: iso(w.at), note: w.note, mentee: toMenteeStaffView(mentee) });

const keyPatternOf = (err: unknown): Record<string, unknown> => (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};

/** Mentoria na mesa da participante (convite ou confirmada), com mesa e mentora, para M7 (E50) e a resposta de E51. */
export async function scheduledTableOf(ctx: AppContext, appt: AppointmentDoc, session?: ClientSession): Promise<ScheduledTable> {
  const opt = session ? { session } : {};
  const [table, mentor] = await Promise.all([
    ctx.c.tables.findOne({ _id: appt.tableId }, { ...opt, projection: { name: 1, number: 1 } }),
    ctx.c.users.findOne({ _id: appt.mentorId }, { ...opt, projection: { name: 1 } }),
  ]);
  return { appointmentId: String(appt._id), startAt: iso(appt.startAt), tableLabel: table ? tableLabel(table) : 'Mesa', mentorName: mentor?.name ?? 'Mentora' };
}

/**
 * RN21 · E51: registra o atendimento fora da mesa em uma transação: cadastro rápido (se for o caso), efeito na
 * inscrição, `walk_ins`, e-mail `walk_in_done` e auditoria. Não cria mentoria nem usa mesa ou horário. A participante
 * sempre termina `done` (atendida, fora da fila); convite ou mentoria confirmada na mesa é cancelada (`walk_in_cancel`).
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
      let cancelledAppointment: ScheduledTable | null = null;

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
          // cadastro novo já concluído: ela acabou de ser atendida; o e-mail `walk_in_done` leva o link pessoal (P6)
          mentee = newMenteeDoc(ctx, f, { status: 'done', now });
          await insertNewMentee(ctx, session, mentee, { actor, action: 'mentee.register_by_staff', ip, after: { walkIn: true }, registered: false });
          outcome = 'created';
          previousStatus = null;
        } else if (!isLiveMentee(existing.status)) {
          // RN01: inscrição cancelada ou `no_show` com o mesmo e-mail volta, já concluída, com os dados novos
          const m = await ctx.c.mentees.findOneAndUpdate(
            { _id: existing._id, status: { $in: ['cancelled', 'no_show'] } },
            {
              $set: { ...f, status: 'done', priority: false, priorityReason: null, currentAppointmentId: null, lastOutcome: null, updatedAt: now },
              $inc: { linkSendCount: 1, version: 1 },
            },
            { session, returnDocument: 'after' },
          );
          if (!m) throw new AppError('CONFLICT', 'A inscrição mudou. Tente de novo.');
          await writeAudit(ctx, session, { actor, action: 'mentee.register_by_staff', entity: 'mentee', entityId: m._id, before: { status: existing.status }, after: { status: 'done', walkIn: true }, ip });
          mentee = m;
          outcome = 'reactivated';
          previousStatus = existing.status;
        } else {
          // RN01: o e-mail já está inscrito; o atendimento vai para a inscrição existente (sem mudar os dados dela)
          mentee = existing;
          outcome = 'linked';
          previousStatus = existing.status;
        }
      }

      const dup = await ctx.c.walkIns.findOne({ eventId: event._id, mentorId: mentor._id, menteeId: mentee._id, deletedAt: null }, { session, projection: { _id: 1 } });
      if (dup) throw new AppError('CONFLICT', WALK_IN_DUPLICATE_MESSAGE);

      if (outcome === 'existing' || outcome === 'linked') {
        const effect = walkInEffect(mentee.status);
        if (!effect.ok) throw new AppError('INVALID_STATE', 'Esta inscrição foi cancelada. Faça um cadastro novo.');
        const appt = effect.cancelsAppointment && mentee.currentAppointmentId
          ? await ctx.c.appointments.findOne({ _id: mentee.currentAppointmentId, menteeId: mentee._id }, { session })
          : null;
        if (appt && isActiveAppointment(appt.status)) {
          // mentoria na mesa (convite ou confirmada): cancelada pela máquina de estados (travas, histórico, aviso à
          // mentora da mesa e auditoria); a participante fica `done` sem aviso de cancelamento
          cancelledAppointment = await scheduledTableOf(ctx, appt, session);
          const applied = await applyTransition(ctx, session, { appointmentId: appt._id, action: 'walk_in_cancel', actor, scope: { menteeId: mentee._id }, ip });
          mentee = applied!.mentee;
          await writeAudit(ctx, session, { actor, action: 'mentee.walk_in_done', entity: 'mentee', entityId: mentee._id, before: { status: previousStatus }, after: { status: 'done', cancelledAppointmentId: String(appt._id) }, ip });
        } else if (effect.changes) {
          // saiu da fila (ou do `no_show`): o Change Stream tira o card do M4 das outras mentoras
          const m = await ctx.c.mentees.findOneAndUpdate(
            { _id: mentee._id, status: mentee.status },
            { $set: { status: 'done', currentAppointmentId: null, lastOutcome: null, priority: false, priorityReason: null, updatedAt: now }, $inc: { version: 1 } },
            { session, returnDocument: 'after' },
          );
          if (!m) throw new AppError('CONFLICT', 'A participante acabou de mudar de situação. Busque de novo.');
          await writeAudit(ctx, session, { actor, action: 'mentee.walk_in_done', entity: 'mentee', entityId: m._id, before: { status: previousStatus }, after: { status: 'done' }, ip });
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
      // um e-mail por atendimento (dedupe pelo id do atendimento): agradecimento, mentora, LinkedIn e link pessoal
      await enqueueWalkInNotification(ctx, session, { type: 'walk_in_done', mentee, walkInId: walkIn._id });
      await writeAudit(ctx, session, {
        actor,
        action: 'walk_in.create',
        entity: 'walk_in',
        entityId: walkIn._id,
        after: { menteeId: String(mentee._id), outcome, previousStatus, status: mentee.status, note: note !== null, cancelledAppointmentId: cancelledAppointment?.appointmentId ?? null },
        ip,
      });
      const res: E51Response = {
        walkIn: toWalkInView(walkIn, mentee),
        outcome,
        linkedExisting: outcome === 'linked',
        name: mentee.name,
        previousStatus,
        status: mentee.status,
        cancelledAppointment,
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
