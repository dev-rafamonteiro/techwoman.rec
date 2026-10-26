import { ObjectId, type ClientSession } from 'mongodb';
import type { OutboxChannel } from '@tw/shared';
import type { AppointmentDoc, MenteeDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { AppError, fromRuleError } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications, enqueueMentorNotifications, enqueueReminders } from '../lib/outbox.js';
import { isRuleError, planTransition, type Actor, type TransitionAction, type TransitionPlan } from '../domain/index.js';

export interface ApplyTransitionInput {
  appointmentId: ObjectId;
  action: TransitionAction;
  actor: Actor;
  /** Escopo do dono (filtro na própria query, nunca só no front). */
  scope?: { mentorId?: ObjectId; menteeId?: ObjectId };
  reason?: string | null;
  ip?: string | null;
  /**
   * Restringe os canais do aviso `plan.notify` à participante (interseção com os disponíveis); RN18 "Não vou": só
   * e-mail. Não vale para o aviso à mentora (`plan.notifyMentor`).
   */
  notifyChannels?: readonly OutboxChannel[];
}

export interface AppliedTransition {
  plan: TransitionPlan;
  appointment: AppointmentDoc;
  mentee: MenteeDoc;
}

const actorRef = (a: Actor) => ({ userId: a.userId ? new ObjectId(a.userId) : null, role: a.role });

/**
 * Aplica uma transição de status na mentoria dentro da transação em andamento. Atualiza, juntos: mentoria (status,
 * travas, histórico), participante (status, prioridade, desfecho), outbox e auditoria (RN17). A escrita é sempre
 * condicional ao status atual; quem perde a corrida recebe INVITE_EXPIRED/INVALID_STATE (ou `null` no `expire`).
 */
export async function applyTransition(ctx: AppContext, session: ClientSession, input: ApplyTransitionInput): Promise<AppliedTransition | null> {
  const now = ctx.now();
  const { c } = ctx;
  const appt = await c.appointments.findOne({ _id: input.appointmentId, ...(input.scope?.mentorId ? { mentorId: input.scope.mentorId } : {}), ...(input.scope?.menteeId ? { menteeId: input.scope.menteeId } : {}) }, { session });
  if (!appt) {
    if (input.action === 'expire') return null;
    throw new AppError('NOT_FOUND', 'Mentoria não encontrada.');
  }
  const planned = planTransition({
    action: input.action,
    appointment: { status: appt.status, startAt: appt.startAt, expiresAt: appt.expiresAt },
    now,
    actor: input.actor,
  });
  if (isRuleError(planned)) {
    if (input.action === 'expire') return null;
    throw fromRuleError(planned);
  }
  const plan = planned;

  const filter: Record<string, unknown> = { _id: appt._id, status: plan.from };
  if (plan.from === 'invited') filter['expiresAt'] = input.action === 'expire' ? { $lte: now } : { $gt: now };

  const set: Record<string, unknown> = { status: plan.appointmentTo, updatedAt: now };
  if (plan.respondedAt) set['respondedAt'] = now;
  if (input.action === 'decline_schedule') set['declineReason'] = 'schedule';
  if (input.action === 'decline_no_interest') set['declineReason'] = 'no_interest';
  if (input.action === 'confirm_in_person') set['confirmedBy'] = actorRef(input.actor);
  if (input.action === 'accept') set['confirmedBy'] = { userId: null, role: 'mentee' };
  const unset: Record<string, ''> = {};
  if (!plan.locks.slotLock) unset['slotLock'] = '';
  if (!plan.locks.menteeLock) unset['menteeLock'] = '';

  const updated = await c.appointments.findOneAndUpdate(
    filter,
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: { history: { from: plan.from, to: plan.appointmentTo, by: actorRef(input.actor), at: now, reason: input.reason ?? plan.reason } },
    },
    { session, returnDocument: 'after' },
  );
  if (!updated) {
    if (input.action === 'expire') return null;
    const cur = await c.appointments.findOne({ _id: appt._id }, { session });
    if (cur && (cur.status === 'expired' || (cur.status === 'invited' && cur.expiresAt && cur.expiresAt.getTime() <= now.getTime()))) {
      throw new AppError('INVITE_EXPIRED', 'O prazo para responder terminou.');
    }
    throw new AppError('INVALID_STATE', 'A mentoria mudou de situação. Atualize a tela.');
  }
  // RN18/RN20: saiu de `invited` ou de `confirmed` por qualquer caminho, o convite ou o pedido de presença pendente
  // deixa de valer (senão um texto qualquer dela cairia nele em E47)
  if ((plan.from === 'invited' || plan.from === 'confirmed') && plan.appointmentTo !== plan.from) {
    await c.presenceChecks.updateOne({ _id: appt._id, status: 'pending' }, { $set: { status: 'closed' } }, { session });
  }

  const menteeSet: Record<string, unknown> = { status: plan.menteeTo, updatedAt: now };
  if (plan.priority) {
    menteeSet['priority'] = plan.priority.value;
    menteeSet['priorityReason'] = plan.priority.reason;
  }
  if (plan.menteeTo === 'waiting') {
    menteeSet['lastOutcome'] = input.action === 'decline_schedule' || input.action === 'mentee_reschedule' ? 'declined_schedule' : input.action === 'expire' ? 'expired' : 'cancelled_by_staff';
  } else if (input.action === 'accept' || input.action === 'confirm_in_person') {
    menteeSet['lastOutcome'] = null;
  }
  if ((plan.menteeTo === 'waiting' || plan.menteeTo === 'cancelled') && input.action !== 'move_cancel') {
    menteeSet['currentAppointmentId'] = null;
  }
  const mentee = await c.mentees.findOneAndUpdate(
    { _id: appt.menteeId },
    { $set: menteeSet, $inc: { version: 1 } },
    { session, returnDocument: 'after' },
  );
  if (!mentee) throw new AppError('INTERNAL', 'Participante da mentoria não encontrada.');

  if (plan.notify && input.action !== 'move_cancel') {
    await enqueueMenteeNotifications(ctx, session, {
      type: plan.notify, mentee, appointmentId: appt._id,
      // inscrição cancelada pela participante: dedupe pela version dela depois do cancelamento
      ...(plan.notify === 'registration_cancelled' ? { dedupeSuffix: mentee.version } : {}),
      ...(input.notifyChannels ? { channels: input.notifyChannels } : {}),
    });
  }
  if (plan.notifyMentor) {
    // aviso à mentora (PLAN, Notificações > Aviso à mentora): canais dela, sem `notifyChannels`; mentora removida ou
    // desativada (sem acesso ao painel do link), nada
    const mentor = await c.users.findOne({ _id: appt.mentorId, status: 'active' }, { session, projection: { email: 1, phone: 1 } });
    if (mentor) await enqueueMentorNotifications(ctx, session, { mentor, appointmentId: appt._id, reason: plan.notifyMentor });
  }
  if (plan.scheduleReminder) {
    await enqueueReminders(ctx, session, mentee, appt);
  }
  await writeAudit(ctx, session, {
    actor: input.actor,
    action: plan.auditAction,
    entity: 'appointment',
    entityId: appt._id,
    before: { status: plan.from },
    after: { status: plan.appointmentTo, reason: input.reason ?? plan.reason },
    ip: input.ip ?? null,
  });
  return { plan, appointment: updated, mentee };
}
