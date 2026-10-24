import type { Collection, ObjectId } from 'mongodb';
import type { AppointmentDoc, EventDoc, TableDoc, UserDoc } from '@tw/db';

/**
 * Identidade do `.ics` de uma mentoria: UID estável (id da mentoria raiz da cadeia `movedFromId`, que E39 cria a cada
 * move) e SEQUENCE = quantos moves a cadeia já teve. Assim a agenda da participante atualiza o evento em vez de duplicá-lo.
 * É o único lugar que decide o UID (a escolha ainda depende de confirmação do usuário; trocar por
 * `{ uid: String(appointment._id), ... }` volta ao id da mentoria vigente).
 */
export async function icsIdentity(
  appointments: Collection<AppointmentDoc>,
  appointment: Pick<AppointmentDoc, '_id' | 'movedFromId'>,
): Promise<{ uid: string; sequence: number }> {
  let root: ObjectId = appointment._id;
  let n = 0;
  let prev = appointment.movedFromId;
  while (prev && n < 50) {
    n += 1;
    root = prev;
    const a = await appointments.findOne({ _id: prev }, { projection: { movedFromId: 1 } });
    prev = a?.movedFromId ?? null;
  }
  return { uid: String(root), sequence: n };
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Dobra linhas em 75 octetos (RFC 5545, 3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1; // não corta um caractere UTF-8
    parts.push(bytes.subarray(i, end).toString('utf8'));
    i = end;
    limit = 74; // linhas de continuação começam com um espaço
  }
  return parts.join('\r\n ');
}

export const tableLabel = (t: Pick<TableDoc, 'name' | 'number'>) => t.name ?? `Mesa ${t.number}`;

export interface IcsInput {
  appointment: Pick<AppointmentDoc, 'startAt' | 'endAt' | 'updatedAt'>;
  event: Pick<EventDoc, 'name' | 'location' | 'timezone'>;
  mentor: Pick<UserDoc, 'name'>;
  table: Pick<TableDoc, 'name' | 'number'>;
  uid: string;
  sequence: number;
}

export const ICS_FILENAME = 'mentoria-tech-woman.ics';

/** `.ics` da mentoria confirmada (METHOD:PUBLISH, horários em UTC; America/Recife = UTC-3, o mesmo instante). */
export function buildIcs(i: IcsInput): string {
  const where = [tableLabel(i.table), i.event.location].filter(Boolean).join(' · ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tech Woman//Mentoria//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${i.event.timezone}`,
    'BEGIN:VEVENT',
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${utc(i.appointment.updatedAt)}`,
    `DTSTART:${utc(i.appointment.startAt)}`,
    `DTEND:${utc(i.appointment.endAt)}`,
    `SUMMARY:${esc(`Mentoria ${i.event.name} com ${i.mentor.name}`)}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(`${tableLabel(i.table)}. Chegue 5 minutos antes.`)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
