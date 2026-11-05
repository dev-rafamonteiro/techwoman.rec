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

export interface SlotCapacity {
  slotId: string;
  /** Mentoras ativas com o horário na disponibilidade. */
  mentorsAvailable: number;
  /** Mesas ativas do evento (a mesma para todos os horários). */
  capacity: number;
}

/**
 * RN22 · Limite de mentoras por horário. Só os horários ADICIONADOS (em `next` e fora de `current`) são checados;
 * manter ou remover horário nunca bloqueia, então dado antigo acima do limite continua valendo. `others` = mentoras
 * ativas no horário sem contar a própria. Devolve os horários lotados (vazio = ok), na ordem de `next`.
 */
export function fullSlotsForAdditions(input: {
  current: readonly string[];
  next: readonly string[];
  others: ReadonlyMap<string, number>;
  capacity: number;
}): SlotCapacity[] {
  const cur = new Set(input.current);
  return [...new Set(input.next)]
    .filter((s) => !cur.has(s))
    .map((s) => ({ slotId: s, mentorsAvailable: input.others.get(s) ?? 0, capacity: input.capacity }))
    .filter((s) => s.mentorsAvailable >= s.capacity);
}

/** RN22 · Horários com mais mentoras disponíveis do que mesas ativas (aviso do admin em E30 e E32). */
export function overCapacitySlots(counts: ReadonlyMap<string, number>, capacity: number, slotIds: readonly string[]): SlotCapacity[] {
  return slotIds.map((s) => ({ slotId: s, mentorsAvailable: counts.get(s) ?? 0, capacity })).filter((s) => s.mentorsAvailable > s.capacity);
}

/**
 * RN22 · Mensagem do 409 SLOT_FULL: "O horário 10h00 já está lotado (23 de 23 mesas)." O número mostrado é limitado
 * às mesas (horário já acima do limite, por override do admin, ainda lê "23 de 23"); sem mesa ativa a frase muda.
 */
export function slotFullMessage(full: readonly { label: string; mentorsAvailable: number; capacity: number }[]): string {
  const list = (xs: readonly string[]) => (xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
  if (full.every((s) => s.capacity <= 0)) {
    return `Ainda não há mesas ativas para ${full.length === 1 ? 'o horário' : 'os horários'} ${list(full.map((s) => s.label))}.`;
  }
  const count = (s: (typeof full)[number]) => `${Math.min(s.mentorsAvailable, s.capacity)} de ${s.capacity} mesas`;
  if (full.length === 1) return `O horário ${full[0]!.label} já está lotado (${count(full[0]!)}).`;
  return `Os horários ${list(full.map((s) => `${s.label} (${count(s)})`))} já estão lotados.`;
}
