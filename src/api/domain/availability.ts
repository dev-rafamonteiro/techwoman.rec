import type { AppointmentStatus } from '@tw/shared';
import { isActiveAppointment } from './status.js';
import { fail, type RuleError } from './types.js';

/**
 * RN11 · A mentora não consegue remover da disponibilidade um horário com mentoria `invited`, `confirmed` ou
 * `in_progress`. Devolve os horários bloqueados (vazio = ok).
 */
export function blockedAvailabilityRemovals(input: {
  current: readonly string[];
  next: readonly string[];
  appointments: readonly { slotId: string; status: AppointmentStatus }[];
}): string[] {
  const nextSet = new Set(input.next);
  const active = new Set(input.appointments.filter((a) => isActiveAppointment(a.status)).map((a) => a.slotId));
  return input.current.filter((s) => !nextSet.has(s) && active.has(s));
}

export function checkAvailabilityUpdate(input: {
  current: readonly string[];
  next: readonly string[];
  appointments: readonly { slotId: string; status: AppointmentStatus }[];
  validSlotIds: readonly string[];
}): { ok: true } | RuleError {
  const valid = new Set(input.validSlotIds);
  const unknown = input.next.filter((s) => !valid.has(s));
  if (unknown.length) return fail('VALIDATION_ERROR', 'Horário inexistente na grade do evento.', { slotIds: unknown });
  const blocked = blockedAvailabilityRemovals(input);
  if (blocked.length) {
    return fail('SLOT_IN_USE', 'Há mentoria marcada em horário que você tentou remover.', { slotIds: blocked });
  }
  return { ok: true };
}

export interface FutureAppointmentRef {
  id: string;
  status: AppointmentStatus;
  startAt: Date;
  endAt: Date;
}

/**
 * RN12 · Desativar mentora é bloqueado enquanto ela tiver mentorias futuras ativas (invited/confirmed/in_progress
 * com fim depois de agora). Devolve a lista para o admin realocar ou cancelar.
 */
export function mentorDisableBlockers(appointments: readonly FutureAppointmentRef[], now: Date): FutureAppointmentRef[] {
  return appointments.filter((a) => isActiveAppointment(a.status) && a.endAt.getTime() > now.getTime());
}
