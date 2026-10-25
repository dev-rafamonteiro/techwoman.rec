import type { AppointmentStatus, MenteeStatus, OutboxType, PriorityReason } from '@tw/shared';
import { fail, type Actor, type RuleError } from './types.js';
import { locksFor } from './status.js';

/** RN09 · não compareceu só a partir de startAt + 10 min. */
export const NO_SHOW_AFTER_MINUTES = 10;

export type TransitionAction =
  | 'accept' // E04: participante aceita (RN06)
  | 'decline_schedule' // E04: recusa "Horário não serve" (RN06)
  | 'decline_no_interest' // E04: recusa "Não tenho mais interesse" (RN06)
  | 'mentee_cancel' // E04: a própria participante cancela
  | 'mentee_reschedule' // E04 `reschedule` ou "Não poderei ir" no WhatsApp: troca de horário (RN19)
  | 'confirm_in_person' // E26/E39: RN08
  | 'start' // E26: opcional
  | 'finish' // E26
  | 'no_show' // E26/E39: RN09
  | 'staff_cancel' // E26/E39: RN10
  | 'expire' // worker: RN07
  | 'move_cancel'; // E39 move: o antigo vira cancelled (motivo "moved"), sem prioridade

export interface TransitionInput {
  action: TransitionAction;
  appointment: { status: AppointmentStatus; startAt: Date; expiresAt: Date | null };
  now: Date;
  actor: Actor;
}

export interface TransitionPlan {
  ok: true;
  from: AppointmentStatus;
  appointmentTo: AppointmentStatus;
  /** Valores finais das travas (false = $unset). */
  locks: { slotLock: boolean; menteeLock: boolean };
  menteeTo: MenteeStatus;
  /** Prioridade da participante: undefined = não mexe; objeto = define (value=false limpa). `queuedAt` nunca é alterado. */
  priority?: { value: boolean; reason: PriorityReason | null };
  /**
   * Mensagem a enfileirar na outbox (dedupeKey = `${type}:${appointmentId}`; `registration_cancelled` usa
   * `registration_cancelled:<menteeId>:<version>`); null = nenhuma.
   */
  notify: OutboxType | null;
  /** Agenda o lembrete de 15 min antes (RN15). */
  scheduleReminder: boolean;
  /** Registro no histórico e na auditoria. */
  reason: string | null;
  auditAction: string;
  respondedAt: boolean;
}

function isExpiredAt(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

const invalid = (from: AppointmentStatus, what: string): RuleError =>
  fail('INVALID_STATE', `Não é possível ${what} uma mentoria em "${from}".`);

function plan(
  from: AppointmentStatus,
  appointmentTo: AppointmentStatus,
  menteeTo: MenteeStatus,
  auditAction: string,
  extra: Partial<Omit<TransitionPlan, 'ok' | 'from' | 'appointmentTo' | 'locks' | 'menteeTo' | 'auditAction'>> = {},
): TransitionPlan {
  return {
    ok: true,
    from,
    appointmentTo,
    locks: locksFor(appointmentTo),
    menteeTo,
    notify: null,
    scheduleReminder: false,
    reason: null,
    respondedAt: false,
    auditAction,
    ...extra,
  };
}

/**
 * Máquina de estados da mentoria (RN06–RN10, RN15). Pura: devolve o plano que o chamador aplica numa transação
 * (status da mentoria e da participante, travas, outbox, auditoria). A escrita real é sempre condicional ao status
 * atual (`{ _id, status: from }`).
 */
export function planTransition(i: TransitionInput): TransitionPlan | RuleError {
  const from = i.appointment.status;
  const { now } = i;
  switch (i.action) {
    case 'accept': {
      if (from !== 'invited') return invalid(from, 'aceitar');
      if (isExpiredAt(i.appointment.expiresAt, now)) return fail('INVITE_EXPIRED', 'O prazo para responder terminou.');
      return plan(from, 'confirmed', 'confirmed', 'appointment.accept', {
        notify: 'confirmed',
        scheduleReminder: true,
        respondedAt: true,
      });
    }
    case 'decline_schedule': {
      if (from !== 'invited') return invalid(from, 'recusar');
      if (isExpiredAt(i.appointment.expiresAt, now)) return fail('INVITE_EXPIRED', 'O prazo para responder terminou.');
      // só a participante recusa (E04); o aviso `slot_released` é para quando ela mesma libera o horário (PLAN, Notificações)
      return plan(from, 'declined', 'waiting', 'appointment.decline', {
        priority: { value: true, reason: 'declined_schedule' },
        notify: i.actor.role === 'mentee' ? 'slot_released' : null,
        reason: 'schedule',
        respondedAt: true,
      });
    }
    case 'decline_no_interest': {
      if (from !== 'invited') return invalid(from, 'recusar');
      if (isExpiredAt(i.appointment.expiresAt, now)) return fail('INVITE_EXPIRED', 'O prazo para responder terminou.');
      return plan(from, 'declined', 'cancelled', 'appointment.decline', {
        notify: 'registration_cancelled',
        reason: 'no_interest',
        respondedAt: true,
      });
    }
    case 'mentee_cancel': {
      if (from !== 'invited' && from !== 'confirmed') return invalid(from, 'cancelar');
      // E36 (admin cancelando a inscrição) também passa por aqui: o aviso `registration_cancelled` é só para quando a
      // própria participante cancela (PLAN, Notificações)
      return plan(from, 'cancelled', 'cancelled', 'appointment.cancel', { notify: i.actor.role === 'mentee' ? 'registration_cancelled' : null, reason: 'mentee_cancelled' });
    }
    case 'mentee_reschedule': {
      // RN19 · só `confirmed` e antes do início; mesa e horário livres na hora; volta à fila com prioridade e o
      // `queuedAt` original. Aviso `slot_released` (horário liberado) por e-mail e WhatsApp; pelo "Não vou" do WhatsApp
      // (RN18) E47 restringe ao e-mail (`notifyChannels`), porque a resposta presence_cancelled já vai pelo WhatsApp.
      if (from !== 'confirmed') return invalid(from, 'trocar de horário');
      if (now.getTime() >= i.appointment.startAt.getTime()) return fail('INVALID_STATE', 'A mentoria já começou; não é possível trocar de horário.');
      return plan(from, 'cancelled', 'waiting', 'appointment.reschedule', {
        priority: { value: true, reason: 'declined_schedule' },
        notify: i.actor.role === 'mentee' ? 'slot_released' : null,
        reason: 'mentee_reschedule',
      });
    }
    case 'confirm_in_person': {
      // RN08 · só convite `invited`; o histórico guarda quem confirmou (actor).
      if (from !== 'invited') return invalid(from, 'confirmar presencialmente');
      if (isExpiredAt(i.appointment.expiresAt, now)) return fail('INVITE_EXPIRED', 'O prazo para responder terminou.');
      return plan(from, 'confirmed', 'confirmed', 'appointment.confirm_in_person', {
        notify: 'confirmed',
        scheduleReminder: true,
        reason: 'in_person',
        respondedAt: true,
      });
    }
    case 'start': {
      if (from !== 'confirmed') return invalid(from, 'iniciar');
      return plan(from, 'in_progress', 'confirmed', 'appointment.start');
    }
    case 'finish': {
      // "Iniciar" é opcional (PLAN): concluir vale a partir de confirmed ou in_progress.
      if (from !== 'confirmed' && from !== 'in_progress') return invalid(from, 'concluir');
      return plan(from, 'done', 'done', 'appointment.finish');
    }
    case 'no_show': {
      // RN09 · só `confirmed` e a partir de startAt + 10 min.
      if (from !== 'confirmed') return invalid(from, 'marcar como não compareceu');
      const earliest = i.appointment.startAt.getTime() + NO_SHOW_AFTER_MINUTES * 60_000;
      if (now.getTime() < earliest) {
        return fail('TOO_EARLY', `Só é possível marcar não compareceu ${NO_SHOW_AFTER_MINUTES} min após o início.`);
      }
      return plan(from, 'no_show', 'no_show', 'appointment.no_show');
    }
    case 'staff_cancel': {
      // RN10 · invited ou confirmed; a participante volta à fila com prioridade; mesa e horário livres na hora.
      if (from !== 'invited' && from !== 'confirmed') return invalid(from, 'cancelar');
      return plan(from, 'cancelled', 'waiting', 'appointment.cancel', {
        priority: { value: true, reason: 'cancelled_by_staff' },
        notify: 'cancelled',
        reason: 'cancelled_by_staff',
      });
    }
    case 'expire': {
      // RN07 · convite `invited` com expiresAt vencido; volta para waiting sem prioridade.
      if (from !== 'invited' || !isExpiredAt(i.appointment.expiresAt, now)) return invalid(from, 'expirar');
      return plan(from, 'expired', 'waiting', 'appointment.expire', { notify: 'expired', reason: 'expired' });
    }
    case 'move_cancel': {
      // E39 mover: só mentoria confirmada (a nova nasce `confirmed`, mantendo a confirmação da participante).
      if (from !== 'confirmed') return invalid(from, 'mover');
      // `notify: 'moved'` vale para a participante; quem aplica (services/move.ts) enfileira a mensagem referenciando a NOVA mentoria.
      return plan(from, 'cancelled', 'confirmed', 'appointment.move', { notify: 'moved', reason: 'moved' });
    }
  }
}

export function isRuleError(x: unknown): x is RuleError {
  return typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false;
}
