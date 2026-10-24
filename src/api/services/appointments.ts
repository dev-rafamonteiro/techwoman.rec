import { ObjectId, type ClientSession } from 'mongodb';
import type { AppointmentDoc, AppointmentHistoryDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { scheduleConflictFrom } from '../lib/errors.js';
import { locksFor } from '../domain/index.js';

/** Insere a mentoria; E11000 dos índices únicos parciais vira TABLE_TAKEN / MENTOR_BUSY / MENTEE_TAKEN. */
export async function insertAppointment(ctx: AppContext, session: ClientSession, doc: AppointmentDoc): Promise<void> {
  try {
    await ctx.c.appointments.insertOne(doc, { session });
  } catch (err) {
    throw scheduleConflictFrom(err) ?? err;
  }
}

export function newAppointmentDoc(input: {
  eventId: string;
  menteeId: ObjectId;
  mentorId: ObjectId;
  tableId: ObjectId;
  slotId: string;
  startAt: Date;
  endAt: Date;
  status: 'invited' | 'confirmed';
  expiresAt: Date | null;
  createdBy: AppointmentDoc['createdBy'];
  confirmedBy?: AppointmentDoc['confirmedBy'];
  movedFromId?: ObjectId | null;
  history: AppointmentHistoryDoc;
  now: Date;
}): AppointmentDoc {
  const locks = locksFor(input.status);
  return {
    _id: new ObjectId(),
    eventId: input.eventId,
    menteeId: input.menteeId,
    mentorId: input.mentorId,
    tableId: input.tableId,
    slotId: input.slotId,
    startAt: input.startAt,
    endAt: input.endAt,
    status: input.status,
    ...(locks.slotLock ? { slotLock: true as const } : {}),
    ...(locks.menteeLock ? { menteeLock: true as const } : {}),
    expiresAt: input.expiresAt,
    respondedAt: input.status === 'confirmed' ? input.now : null,
    declineReason: null,
    createdBy: input.createdBy,
    confirmedBy: input.confirmedBy ?? null,
    movedFromId: input.movedFromId ?? null,
    history: [input.history],
    createdAt: input.now,
    updatedAt: input.now,
  };
}
