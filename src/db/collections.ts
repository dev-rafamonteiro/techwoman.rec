import type { Collection, Db } from 'mongodb';
import type {
  AppointmentDoc,
  AuditLogDoc,
  EventDoc,
  FeedbackDoc,
  IdempotencyDoc,
  MenteeDoc,
  MentorPhotoDoc,
  OutboxDoc,
  SessionDoc,
  ShortLinkDoc,
  TableDoc,
  UserDoc,
  SlotCounterDoc,
  WalkInDoc,
} from './types.js';

export const COLLECTIONS = {
  events: 'events',
  users: 'users',
  mentorPhotos: 'mentor_photos',
  sessions: 'sessions',
  tables: 'tables',
  mentees: 'mentees',
  appointments: 'appointments',
  outbox: 'outbox',
  auditLogs: 'audit_logs',
  idempotencyKeys: 'idempotency_keys',
  shortLinks: 'short_links',
  feedbacks: 'feedbacks',
  walkIns: 'walk_ins',
  slotCounters: 'slot_counters',
} as const;

export interface Collections {
  events: Collection<EventDoc>;
  users: Collection<UserDoc>;
  mentorPhotos: Collection<MentorPhotoDoc>;
  sessions: Collection<SessionDoc>;
  tables: Collection<TableDoc>;
  mentees: Collection<MenteeDoc>;
  appointments: Collection<AppointmentDoc>;
  outbox: Collection<OutboxDoc>;
  auditLogs: Collection<AuditLogDoc>;
  idempotencyKeys: Collection<IdempotencyDoc>;
  shortLinks: Collection<ShortLinkDoc>;
  feedbacks: Collection<FeedbackDoc>;
  walkIns: Collection<WalkInDoc>;
  slotCounters: Collection<SlotCounterDoc>;
}

export function getCollections(db: Db): Collections {
  return {
    events: db.collection<EventDoc>(COLLECTIONS.events),
    users: db.collection<UserDoc>(COLLECTIONS.users),
    mentorPhotos: db.collection<MentorPhotoDoc>(COLLECTIONS.mentorPhotos),
    sessions: db.collection<SessionDoc>(COLLECTIONS.sessions),
    tables: db.collection<TableDoc>(COLLECTIONS.tables),
    mentees: db.collection<MenteeDoc>(COLLECTIONS.mentees),
    appointments: db.collection<AppointmentDoc>(COLLECTIONS.appointments),
    outbox: db.collection<OutboxDoc>(COLLECTIONS.outbox),
    auditLogs: db.collection<AuditLogDoc>(COLLECTIONS.auditLogs),
    idempotencyKeys: db.collection<IdempotencyDoc>(COLLECTIONS.idempotencyKeys),
    shortLinks: db.collection<ShortLinkDoc>(COLLECTIONS.shortLinks),
    feedbacks: db.collection<FeedbackDoc>(COLLECTIONS.feedbacks),
    walkIns: db.collection<WalkInDoc>(COLLECTIONS.walkIns),
    slotCounters: db.collection<SlotCounterDoc>(COLLECTIONS.slotCounters),
  };
}
