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
 * RN16 · Alterar horários, duração ou intervalo do evento é recusado se existir qualquer mentoria ativa.
 * `lockedAppointments` = mentorias com `slotLock` (invited, confirmed, in_progress; também done/no_show, que
 * seguem referenciando o horário).
 */
export function checkGridChange(current: GridFields, next: GridFields, lockedAppointments: number): { ok: true } | RuleError {
  if (gridChanged(current, next) && lockedAppointments > 0) {
    return fail('GRID_LOCKED', 'Existem mentorias marcadas; não é possível alterar a grade de horários.');
  }
  return { ok: true };
}
