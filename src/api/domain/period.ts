import { localMinutesOfDay, type PreferredPeriod } from '@tw/shared';

export type ConcretePeriod = Exclude<PreferredPeriod, 'any'>;

/**
 * RN14 · Manhã = horários que começam antes de 12h00; início da tarde = 12h00 a 14h59; fim da tarde = 15h00 em diante
 * (horário de Recife, ou o fuso do evento).
 */
export function periodOfStart(startAt: Date, timezone: string): ConcretePeriod {
  const m = localMinutesOfDay(startAt, timezone);
  if (m < 12 * 60) return 'morning';
  if (m < 15 * 60) return 'early_afternoon';
  return 'late_afternoon';
}

/** `any` casa com qualquer horário (usado em "Preferência dela" de M5 e no filtro de M4). */
export function matchesPeriod(preferred: PreferredPeriod, startAt: Date, timezone: string): boolean {
  return preferred === 'any' || periodOfStart(startAt, timezone) === preferred;
}
