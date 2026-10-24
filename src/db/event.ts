import type { Db } from 'mongodb';
import { DEFAULT_TIMEZONE, generateSlots } from '@tw/shared';
import { getCollections } from './collections.js';
import { DEFAULT_EVENT_ID } from './client.js';
import type { EventDoc, TableDoc } from './types.js';

/** Áreas da gamificação (js/jornada.js). A lista final depende da Rafaela; editável em A7. */
export const DEFAULT_AREAS = [
  { key: 'backend', label: 'Backend' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'dados', label: 'Dados' },
  { key: 'ux', label: 'UX & Design' },
  { key: 'produto', label: 'Produto' },
  { key: 'cloud', label: 'Cloud & Infraestrutura' },
];

export const DEFAULT_TEMPLATES: EventDoc['templates'] = {
  registered: 'Oi, {nome}! Recebemos sua inscrição na mentoria do Tech Woman. Acompanhe aqui: {link}',
  invite: '{mentora} quer te mentorar às {horario}, na {mesa}. Confirme até {prazo}: {link}',
  confirmed: 'Combinado! {horario} na {mesa} com {mentora}. Chegue 5 minutos antes.',
  reminder: 'Sua mentoria começa às {horario} na {mesa}. Te esperamos!',
  expired: 'O prazo para confirmar terminou e o horário foi liberado. Sua inscrição continua ativa.',
  cancelled: 'Sua mentoria das {horario} foi cancelada. Você voltou para a fila com prioridade.',
};

export const CONSENT_VERSION = '2026-10-v1';

export function buildEvent(overrides: Partial<Omit<EventDoc, 'slots'>> = {}, now = new Date()): EventDoc {
  const base = {
    _id: DEFAULT_EVENT_ID,
    name: 'Tech Woman',
    date: '2026-11-14',
    location: 'Recife',
    timezone: DEFAULT_TIMEZONE,
    startTime: '09:00',
    endTime: '18:00',
    slotMinutes: 40,
    gapMinutes: 5,
    responseWindowMinutes: 15,
    minLeadMinutes: 10,
    registrationOpen: false,
    areas: DEFAULT_AREAS,
    templates: DEFAULT_TEMPLATES,
    consentVersion: CONSENT_VERSION,
    version: 1,
    updatedAt: now,
    ...overrides,
  };
  return { ...base, slots: generateSlots(base).map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })) };
}

/** Cria o evento se ainda não existir (não sobrescreve configuração feita em A7). */
export async function seedEvent(db: Db, overrides: Partial<Omit<EventDoc, 'slots'>> = {}): Promise<EventDoc> {
  const { events } = getCollections(db);
  const doc = buildEvent(overrides);
  await events.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
  return (await events.findOne({ _id: doc._id }))!;
}

/** Gera as mesas 1..n (idempotente por número). */
export async function seedTables(db: Db, eventId: string, count = 20): Promise<number> {
  const { tables } = getCollections(db);
  let created = 0;
  for (let number = 1; number <= count; number++) {
    const r = await tables.updateOne(
      { eventId, number },
      { $setOnInsert: { eventId, number, name: null, location: null, active: true } satisfies Omit<TableDoc, '_id'> },
      { upsert: true },
    );
    if (r.upsertedCount) created++;
  }
  return created;
}
