import type { Db, IndexDescription } from 'mongodb';
import { COLLECTIONS } from './collections.js';
import { applyValidators } from './schemas.js';
import { createSearchIndexes } from './search-indexes.js';

/** Nomes estáveis dos índices únicos de agenda; a API mapeia E11000 por eles (keyPattern como principal). */
export const INDEX_NAMES = {
  tableSlot: 'appt_table_slot_active',
  mentorSlot: 'appt_mentor_slot_active',
  menteeActive: 'appt_mentee_active',
} as const;

export type ScheduleConflictCode = 'TABLE_TAKEN' | 'MENTOR_BUSY' | 'MENTEE_TAKEN';

const NAME_TO_CODE: Record<string, ScheduleConflictCode> = {
  [INDEX_NAMES.tableSlot]: 'TABLE_TAKEN',
  [INDEX_NAMES.mentorSlot]: 'MENTOR_BUSY',
  [INDEX_NAMES.menteeActive]: 'MENTEE_TAKEN',
};

/**
 * Traduz um erro E11000 de `appointments` para o código de conflito (PLAN, "Concorrência"). Usa `keyPattern`
 * (estável) e, na falta, o nome do índice dentro da mensagem. Devolve null se não for conflito de agenda.
 */
export function mapDuplicateKeyError(err: unknown): ScheduleConflictCode | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string; errmsg?: string };
  if (e.code !== 11000) return null;
  const kp = e.keyPattern;
  if (kp) {
    if ('tableId' in kp) return 'TABLE_TAKEN';
    if ('mentorId' in kp) return 'MENTOR_BUSY';
    if ('menteeId' in kp) return 'MENTEE_TAKEN';
  }
  const msg = `${e.message ?? ''} ${e.errmsg ?? ''}`;
  for (const [name, code] of Object.entries(NAME_TO_CODE)) if (msg.includes(name)) return code;
  return null;
}

const partialLock = { slotLock: true } as const;
const partialMentee = { menteeLock: true } as const;

const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.appointments]: [
    // unicidade e conflitos de agenda
    { key: { eventId: 1, tableId: 1, slotId: 1 }, name: INDEX_NAMES.tableSlot, unique: true, partialFilterExpression: partialLock },
    { key: { eventId: 1, mentorId: 1, slotId: 1 }, name: INDEX_NAMES.mentorSlot, unique: true, partialFilterExpression: partialLock },
    { key: { eventId: 1, menteeId: 1 }, name: INDEX_NAMES.menteeActive, unique: true, partialFilterExpression: partialMentee },
    // consultas
    { key: { eventId: 1, mentorId: 1, startAt: 1 }, name: 'appt_mentor_start' },
    { key: { status: 1, expiresAt: 1 }, name: 'appt_status_expires' },
    { key: { eventId: 1, menteeId: 1, createdAt: -1 }, name: 'appt_mentee_created' },
  ],
  [COLLECTIONS.mentees]: [
    { key: { eventId: 1, emailNorm: 1 }, name: 'mentee_event_email', unique: true },
    { key: { tokenHash: 1 }, name: 'mentee_token', unique: true },
    { key: { eventId: 1, status: 1, priority: -1, queuedAt: 1 }, name: 'mentee_queue' },
    { key: { eventId: 1, area: 1, status: 1 }, name: 'mentee_area_status' },
  ],
  [COLLECTIONS.users]: [{ key: { email: 1 }, name: 'user_email', unique: true }],
  [COLLECTIONS.bradescoMentors]: [{ key: { name: 1 }, name: 'bradesco_mentor_name', unique: true }],
  [COLLECTIONS.bradescoReservations]: [
    { key: { eventId: 1, mentorId: 1, slotId: 1 }, name: 'bradesco_mentor_slot', unique: true },
    { key: { eventId: 1, createdAt: -1 }, name: 'bradesco_reservation_created' },
  ],
  [COLLECTIONS.tables]: [{ key: { eventId: 1, number: 1 }, name: 'table_event_number', unique: true }],
  [COLLECTIONS.sessions]: [
    { key: { expiresAt: 1 }, name: 'session_ttl', expireAfterSeconds: 0 },
    { key: { userId: 1 }, name: 'session_user' },
  ],
  [COLLECTIONS.outbox]: [
    { key: { status: 1, nextAttemptAt: 1 }, name: 'outbox_status_next' },
    { key: { dedupeKey: 1 }, name: 'outbox_dedupe', unique: true },
    { key: { appointmentId: 1 }, name: 'outbox_appointment' },
    { key: { status: 1, lockedAt: 1 }, name: 'outbox_sending_lock' },
  ],
  [COLLECTIONS.auditLogs]: [
    { key: { eventId: 1, at: -1 }, name: 'audit_event_at' },
    { key: { actorId: 1, at: -1 }, name: 'audit_actor_at' },
  ],
  // chaves de idempotência: TTL de 10 min (PLAN)
  [COLLECTIONS.idempotencyKeys]: [{ key: { createdAt: 1 }, name: 'idem_ttl', expireAfterSeconds: 600 }],
  // RN18: resposta digitada procura o `pending` mais recente do telefone
  [COLLECTIONS.presenceChecks]: [{ key: { phone: 1, status: 1, sentAt: -1 }, name: 'presence_phone_status_sent' }],
  // mensagens recebidas do WAHA: some em `expireAt` (7 dias)
  [COLLECTIONS.whatsappInbound]: [{ key: { expireAt: 1 }, name: 'wa_inbound_ttl', expireAfterSeconds: 0 }],
  // links curtos (E48): um por participante, tipo e versão do token; também serve ao deleteMany por menteeId
  // e somem em `expireAt` (fim do evento + 7 dias)
  [COLLECTIONS.shortLinks]: [
    { key: { menteeId: 1, kind: 1, tokenVersion: 1 }, name: 'short_link_mentee_kind_version', unique: true },
    { key: { expireAt: 1 }, name: 'short_link_ttl', expireAfterSeconds: 0 },
  ],
};

/**
 * Cria validadores e índices. Idempotente: pode rodar a cada start da API. Se um índice existir com o mesmo nome
 * e definição diferente, o MongoDB recusa; nesse caso derrube o índice antes (ambiente de dev).
 */
export async function createIndexes(db: Db, opts: { searchIndexes?: boolean } = {}): Promise<void> {
  await applyValidators(db);
  for (const [coll, specs] of Object.entries(INDEXES)) {
    await db.collection(coll).createIndexes(specs);
  }
  // coleções sem índice (events) precisam existir antes de transações e Change Streams
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name));
  for (const name of Object.values(COLLECTIONS)) {
    if (existing.has(name)) continue;
    try {
      await db.createCollection(name);
    } catch (err) {
      if ((err as { code?: number }).code !== 48) throw err;
    }
  }
  // Atlas Search (busca por palavra); em MongoDB sem Atlas Search é ignorado
  if (opts.searchIndexes !== false) await createSearchIndexes(db);
}
