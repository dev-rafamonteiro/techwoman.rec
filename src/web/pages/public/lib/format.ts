/** Utilitários puros de P4–P6 (o formato 14h20 e a máscara vêm de ui/format). */

export function isValidPhone(masked: string): boolean {
  const d = masked.replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
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
