import { fail, type RuleError } from './types.js';

export interface GridFields {
  date: string;
  timezone: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  gapMinutes: number;
}

export function gridChanged(a: GridFields, b: GridFields): boolean {
  return (
    a.date !== b.date ||
    a.timezone !== b.timezone ||
    a.startTime !== b.startTime ||
    a.endTime !== b.endTime ||
    a.slotMinutes !== b.slotMinutes ||
    a.gapMinutes !== b.gapMinutes
  );
}

/**
 * RN16 · Alterar data, fuso, horários, duração ou intervalo do evento é recusado se existir qualquer mentoria com slotLock.
 * `lockedAppointments` = mentorias com `slotLock` (invited, confirmed, in_progress, done) mais as `no_show`, que
 * já não ocupam a mesa mas seguem referenciando o horário.
 */
export function checkGridChange(current: GridFields, next: GridFields, lockedAppointments: number): { ok: true } | RuleError {
  if (gridChanged(current, next) && lockedAppointments > 0) {
    return fail('GRID_LOCKED', 'Existem mentorias marcadas; não é possível alterar a grade de horários.');
  }
  return { ok: true };
}
