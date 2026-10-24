/** Utilitários puros de M1–M6. */

/** Aviso "Começa em 5 min" quando faltam <= 5 min e a sessão ainda não começou. */
export function startsSoon(startAtIso: string, nowMs: number): boolean {
  const left = new Date(startAtIso).getTime() - nowMs;
  return left > 0 && left <= 5 * 60000;
}

/** "Não compareceu" só 10 min após o início (E26, RN09). */
export function noShowAllowed(startAtIso: string, nowMs: number): boolean {
  return nowMs >= new Date(startAtIso).getTime() + 10 * 60000;
}

/** "HH:mm" em horário de Recife (para os atalhos Manhã/Tarde de M3). */
export function recifeHHmm(iso: string): string {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === 'hour')?.value}:${p.find((x) => x.type === 'minute')?.value}`;
}
