// Utilitários de fuso e de grade, puros e sem dependências. Usados por API, worker, seed e testes.

export const DEFAULT_TIMEZONE = 'America/Recife';

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Componentes de calendário de um instante, no fuso dado. */
export function zonedParts(d: Date, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(d)) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return {
    year: o['year']!,
    month: o['month']!,
    day: o['day']!,
    hour: o['hour']!,
    minute: o['minute']!,
    second: o['second']!,
  };
}

/** Deslocamento do fuso em minutos (UTC-3 => -180) no instante dado. */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-14" + "09:00" no fuso => instante UTC. */
export function zonedTimeToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2 * 60000;
  return new Date(utc);
}

/** Minutos desde 00:00 locais. */
export function localMinutesOfDay(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  return p.hour * 60 + p.minute;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** "14h20" (formato das telas). */
export function formatTimeBR(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.hour}h${String(p.minute).padStart(2, '0')}`;
}

export interface GridConfig {
  date: string;
  timezone: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  gapMinutes: number;
}

export interface GridSlot {
  id: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Grade fixa de horários (decisão do SDD 2): início, +slot, +gap... enquanto o fim da sessão caber em `endTime`.
 * 08:00–18:00, 40 min + 5 min => 13 horários (s01..s13).
 */
export function generateSlots(cfg: GridConfig): GridSlot[] {
  const start = hhmmToMinutes(cfg.startTime);
  const end = hhmmToMinutes(cfg.endTime);
  const step = cfg.slotMinutes + cfg.gapMinutes;
  const out: GridSlot[] = [];
  if (step <= 0 || cfg.slotMinutes <= 0) return out;
  const base = zonedTimeToUtc(cfg.date, '00:00', cfg.timezone).getTime();
  let n = 1;
  for (let t = start; t + cfg.slotMinutes <= end; t += step, n++) {
    out.push({
      id: `s${String(n).padStart(2, '0')}`,
      startAt: new Date(base + t * 60000),
      endAt: new Date(base + (t + cfg.slotMinutes) * 60000),
    });
  }
  return out;
}
