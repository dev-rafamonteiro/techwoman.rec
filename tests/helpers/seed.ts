import { ObjectId, type Db } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import { createIndexes } from "../../src/db/indexes.js";
import { buildEvent } from "../../src/db/event.js";
import { getCollections } from "../../src/db/collections.js";
import type { AppointmentDoc, MenteeDoc, TableDoc, UserDoc } from "../../src/db/types.js";

export const EVENT_ID = "techwoman-2026";
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function userDoc(i: number, over: Partial<UserDoc> = {}): UserDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    name: `Mentora ${i}`,
    email: `mentora${i}@techwoman.test`,
    roles: ["mentor"],
    passwordHash: "x",
    mustChangePassword: false,
    status: "active",
    linkedin: null,
    organization: null,
    areas: ["dados"],
    bio: null,
    photoUrl: null,
    availability: Array.from({ length: 9 }, (_, k) => `s${String(k + 1).padStart(2, "0")}`),
    lastLoginAt: null,
    failedLogins: 0,
    failedLoginWindowStart: null,
    lockedUntil: null,
    passwordChangedAt: null,
    passwordResetCount: 0,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export function menteeDoc(i: number, over: Partial<MenteeDoc> = {}): { token: string; doc: MenteeDoc } {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const email = `participante${i}@exemplo.test`;
  return {
    token,
    doc: {
      _id: new ObjectId(),
      eventId: EVENT_ID,
      name: `Participante ${i}`,
      email,
      emailNorm: email,
      phone: `+5581999${String(100000 + i)}`,
      linkedin: null,
      area: "dados",
      quizScores: {},
      preferredPeriod: "any",
      note: null,
      consent: { version: "2026-10-v1", acceptedAt: now },
      status: "waiting",
      priority: false,
      priorityReason: null,
      queuedAt: new Date(now.getTime() + i * 1000),
      currentAppointmentId: null,
      lastOutcome: null,
      tokenHash: sha256(token),
      linkSendCount: 1,
      tokenVersion: 1,
      anonymizedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...over,
    },
  };
}

export function appointmentDoc(over: Partial<AppointmentDoc> & Pick<AppointmentDoc, "menteeId" | "mentorId" | "tableId" | "slotId">): AppointmentDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    eventId: EVENT_ID,
    startAt: new Date(now.getTime() + 3600_000),
    endAt: new Date(now.getTime() + 3600_000 + 45 * 60_000),
    status: "invited",
    slotLock: true,
    menteeLock: true,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
    respondedAt: null,
    declineReason: null,
    createdBy: { userId: over.mentorId, role: "mentor" },
    confirmedBy: null,
    movedFromId: null,
    history: [{ from: null, to: "invited", by: { userId: over.mentorId, role: "mentor" }, at: now, reason: null }],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export interface World {
  mentors: UserDoc[];
  tables: TableDoc[];
  mentees: { token: string; doc: MenteeDoc }[];
  slotIds: string[];
}

/** Evento padrão (9 slots), índices, `tables` mesas, `mentors` mentoras e `mentees` participantes waiting. */
export async function seedWorld(db: Db, opts: { mentors?: number; tables?: number; mentees?: number; registrationOpen?: boolean } = {}): Promise<World> {
  const { mentors = 3, tables = 20, mentees = 10, registrationOpen = true } = opts;
  await createIndexes(db);
  const c = getCollections(db);
  const event = buildEvent({ registrationOpen });
  await c.events.insertOne(event);
  const tableDocs: TableDoc[] = Array.from({ length: tables }, (_, k) => ({ _id: new ObjectId(), eventId: EVENT_ID, number: k + 1, name: null, location: null, active: true }));
  if (tableDocs.length) await c.tables.insertMany(tableDocs);
  const mentorDocs = Array.from({ length: mentors }, (_, k) => userDoc(k + 1));
  if (mentorDocs.length) await c.users.insertMany(mentorDocs);
  const menteeDocs = Array.from({ length: mentees }, (_, k) => menteeDoc(k + 1));
  if (menteeDocs.length) await c.mentees.insertMany(menteeDocs.map((m) => m.doc));
  return { mentors: mentorDocs, tables: tableDocs, mentees: menteeDocs, slotIds: event.slots.map((s) => s.id) };
}
