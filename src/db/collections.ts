import type { Collection, Db } from 'mongodb';
import type {
  AppointmentDoc,
  AuditLogDoc,
  EventDoc,
  FeedbackDoc,
  IdempotencyDoc,
  MenteeDoc,
  OutboxDoc,
  SessionDoc,
  ShortLinkDoc,
  TableDoc,
  UserDoc,
  WalkInDoc,
} from './types.js';

export const COLLECTIONS = {
  events: 'events',
  users: 'users',
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
} as const;

export interface Collections {
  events: Collection<EventDoc>;
  users: Collection<UserDoc>;
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
}

export function getCollections(db: Db): Collections {
  return {
    events: db.collection<EventDoc>(COLLECTIONS.events),
    users: db.collection<UserDoc>(COLLECTIONS.users),
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
  };
}
