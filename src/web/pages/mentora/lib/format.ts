/** Utilitários puros das telas M1–M6. */
export { formatHour } from '../../public/lib/format';

/** "inscrita há 25 min" / "inscrita há 1 h 05". */
export function waitingText(queuedAtIso: string, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - new Date(queuedAtIso).getTime()) / 60000));
  if (min < 1) return 'inscrita agora';
  if (min < 60) return `inscrita há ${min} min`;
  return `inscrita há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Aviso "Começa em 5 min" quando faltam <= 5 min e a sessão ainda não começou. */
export function startsSoon(startAtIso: string, nowMs: number): boolean {
  const left = new Date(startAtIso).getTime() - nowMs;
  return left > 0 && left <= 5 * 60000;
}

/** "Não compareceu" só 10 min após o início (E26, RN10). */
export function noShowAllowed(startAtIso: string, nowMs: number): boolean {
  return nowMs >= new Date(startAtIso).getTime() + 10 * 60000;
}
