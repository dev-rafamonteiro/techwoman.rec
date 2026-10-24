/** Utilitários puros das telas P1–P6 (sem dependência de componentes). */

const TZ = 'America/Recife';

/** 14h20 (horário de Recife). Minutos zerados saem como 14h00. */
export function formatHour(iso: string, timeZone: string = TZ): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(
    new Date(iso),
  );
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${Number(h)}h${m}`;
}

/** Máscara (00) 00000-0000 / (00) 0000-0000 aplicada enquanto digita. */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(masked: string): boolean {
  const d = masked.replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
}

/** mm:ss do contador regressivo; `urgent` nos 3 min finais (vermelho). */
export function countdown(expiresAtMs: number, nowMs: number): { text: string; urgent: boolean; over: boolean } {
  const left = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return { text: `${mm}:${ss}`, urgent: left <= 180, over: left === 0 };
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Gera o .ics (UTC) da mentoria confirmada, no navegador. */
export function buildIcs(o: { uid: string; startAt: string; endAt: string; summary: string; location: string; description: string }): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tech Woman//Mentoria//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${o.uid}@techwoman.dev`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(o.startAt)}`,
    `DTEND:${icsDate(o.endAt)}`,
    `SUMMARY:${icsEscape(o.summary)}`,
    `LOCATION:${icsEscape(o.location)}`,
    `DESCRIPTION:${icsEscape(o.description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(o.summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
