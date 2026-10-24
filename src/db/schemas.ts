import type { Db } from 'mongodb';
import {
  APPOINTMENT_STATUSES,
  MENTEE_STATUSES,
  PREFERRED_PERIODS,
  PRIORITY_REASONS,
  ROLES,
  USER_STATUSES,
} from '@tw/shared';
import { COLLECTIONS } from './collections.js';

type Schema = Record<string, unknown>;

const str: Schema = { bsonType: 'string' };
const strN: Schema = { bsonType: ['string', 'null'] };
const bool: Schema = { bsonType: 'bool' };
const int: Schema = { bsonType: ['int', 'long'] };
const date: Schema = { bsonType: 'date' };
const dateN: Schema = { bsonType: ['date', 'null'] };
const oid: Schema = { bsonType: 'objectId' };
const oidN: Schema = { bsonType: ['objectId', 'null'] };
const enumOf = (values: readonly string[]): Schema => ({ bsonType: 'string', enum: [...values] });
const arrOf = (items: Schema): Schema => ({ bsonType: 'array', items });

function strictObject(properties: Record<string, Schema>, required: string[]): Schema {
  return { bsonType: 'object', required, additionalProperties: false, properties };
}

const ACTOR_ROLES = [...ROLES, 'mentee', 'system'] as const;

export const usersSchema: Schema = strictObject(
  {
    _id: oid,
    name: str,
    email: str,
    roles: arrOf(enumOf(ROLES)),
    passwordHash: str,
    mustChangePassword: bool,
    status: enumOf(USER_STATUSES),
    linkedin: strN,
    organization: strN,
    areas: arrOf(str),
    bio: strN,
    photoUrl: strN,
    availability: arrOf(str),
    lastLoginAt: dateN,
    failedLogins: int,
    failedLoginWindowStart: dateN,
    lockedUntil: dateN,
    passwordChangedAt: dateN,
    passwordResetCount: int,
    createdBy: oidN,
    createdAt: date,
    updatedAt: date,
  },
  ['name', 'email', 'roles', 'passwordHash', 'mustChangePassword', 'status', 'areas', 'availability', 'createdAt'],
);

export const menteesSchema: Schema = strictObject(
  {
    _id: oid,
    eventId: str,
    name: str,
    email: str,
    emailNorm: str,
    phone: strN,
    linkedin: strN,
    area: str,
    quizScores: { bsonType: 'object' },
    preferredPeriod: enumOf(PREFERRED_PERIODS),
    note: strN,
    consent: {
      bsonType: ['object', 'null'],
      required: ['version', 'acceptedAt'],
      additionalProperties: false,
      properties: { version: str, acceptedAt: date },
    },
    status: enumOf(MENTEE_STATUSES),
    priority: bool,
    priorityReason: { bsonType: ['string', 'null'], enum: [...PRIORITY_REASONS, null] },
    queuedAt: date,
    currentAppointmentId: oidN,
    lastOutcome: { bsonType: ['string', 'null'], enum: ['declined_schedule', 'expired', 'cancelled_by_staff', null] },
    tokenHash: str,
    tokenVersion: int,
    linkSendCount: int,
    anonymizedAt: dateN,
    version: int,
    createdAt: date,
    updatedAt: date,
  },
  ['eventId', 'name', 'email', 'emailNorm', 'area', 'preferredPeriod', 'status', 'priority', 'queuedAt', 'tokenHash', 'createdAt'],
);

const historyEntry = strictObject(
  {
    from: { bsonType: ['string', 'null'], enum: [...APPOINTMENT_STATUSES, null] },
    to: enumOf(APPOINTMENT_STATUSES),
    by: strictObject({ userId: oidN, role: enumOf(ACTOR_ROLES) }, ['role']),
    at: date,
    reason: strN,
  },
  ['to', 'by', 'at'],
);

export const appointmentsSchema: Schema = strictObject(
  {
    _id: oid,
    eventId: str,
    menteeId: oid,
    mentorId: oid,
    tableId: oid,
    slotId: str,
    startAt: date,
    endAt: date,
    status: enumOf(APPOINTMENT_STATUSES),
    slotLock: { bsonType: 'bool', enum: [true] },
    menteeLock: { bsonType: 'bool', enum: [true] },
    expiresAt: dateN,
    respondedAt: dateN,
    declineReason: strN,
    createdBy: strictObject({ userId: oid, role: enumOf(['mentor', 'admin', 'super_admin']) }, ['userId', 'role']),
    confirmedBy: {
      bsonType: ['object', 'null'],
      additionalProperties: false,
      properties: { userId: oidN, role: enumOf(ACTOR_ROLES) },
    },
    movedFromId: oidN,
    history: arrOf(historyEntry),
    createdAt: date,
    updatedAt: date,
  },
  ['eventId', 'menteeId', 'mentorId', 'tableId', 'slotId', 'startAt', 'endAt', 'status', 'history', 'createdBy', 'createdAt'],
);

export const VALIDATED_COLLECTIONS: Record<string, Schema> = {
  [COLLECTIONS.users]: usersSchema,
  [COLLECTIONS.mentees]: menteesSchema,
  [COLLECTIONS.appointments]: appointmentsSchema,
};

/** Cria/atualiza o validador `$jsonSchema` (strict, error) das coleções. Idempotente. */
export async function applyValidators(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, schema] of Object.entries(VALIDATED_COLLECTIONS)) {
    const validator = { $jsonSchema: schema };
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      try {
        await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
      } catch (err) {
        // outra réplica criou primeiro (NamespaceExists): só aplica o validador
        if ((err as { code?: number }).code !== 48) throw err;
        await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
      }
    }
  }
}
