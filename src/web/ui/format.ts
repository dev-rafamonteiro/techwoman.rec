/** Formatação pt-BR. Horários sempre em horário de Recife e no formato 14h20. */
export const EVENT_TIMEZONE = 'America/Recife';

/** "2026-11-14T17:20:00Z" -> "14h20". */
export function formatTime(iso: string, timeZone: string = EVENT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${Number(h)}h${m}`;
}

/** "HH:mm" (ou "14:20") -> "14h20". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${Number(h)}h${(m ?? '00').padStart(2, '0')}`;
}

/** "14h20 às 15h00". */
export function formatRange(startIso: string, endIso: string, timeZone?: string): string {
  return `${formatTime(startIso, timeZone)} às ${formatTime(endIso, timeZone)}`;
}

/** "sábado, 14/11". */
export function formatDayShort(iso: string, timeZone: string = EVENT_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone }).format(new Date(iso));
}

/** "14/11/2026 14h20". */
export function formatDateTime(iso: string, timeZone: string = EVENT_TIMEZONE): string {
  const d = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(new Date(iso));
  return `${d} ${formatTime(iso, timeZone)}`;
}

/** Segundos -> "09:34". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "inscrita há 25 min", "há 2 h". */
export function formatWaiting(fromIso: string, nowMs: number = Date.now()): string {
  const min = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 60000));
  if (min < 1) return 'inscrita agora';
  if (min < 60) return `inscrita há ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `inscrita há ${h} h${r ? ` ${r} min` : ''}`;
}

/** Máscara (00) 00000-0000. */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const PERIOD_LABELS = {
  morning: 'Manhã',
  early_afternoon: 'Início da tarde',
  late_afternoon: 'Fim da tarde',
  any: 'Qualquer horário',
} as const;
