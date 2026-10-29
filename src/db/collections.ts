import type { Collection, Db } from 'mongodb';
import type {
  AppointmentDoc,
  BradescoMentorDoc,
  BradescoReservationDoc,
  AuditLogDoc,
  EventDoc,
  IdempotencyDoc,
  MenteeDoc,
  OutboxDoc,
  PresenceCheckDoc,
  SessionDoc,
  ShortLinkDoc,
  TableDoc,
  UserDoc,
  WhatsappInboundDoc,
} from './types.js';

export const COLLECTIONS = {
  events: 'events',
  users: 'users',
  sessions: 'sessions',
  tables: 'tables',
  mentees: 'mentees',
  appointments: 'appointments',
  bradescoMentors: 'bradesco_mentors',
  bradescoReservations: 'bradesco_reservations',
  outbox: 'outbox',
  auditLogs: 'audit_logs',
  idempotencyKeys: 'idempotency_keys',
  presenceChecks: 'presence_checks',
  whatsappInbound: 'whatsapp_inbound',
  shortLinks: 'short_links',
} as const;

export interface Collections {
  events: Collection<EventDoc>;
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  tables: Collection<TableDoc>;
  mentees: Collection<MenteeDoc>;
  appointments: Collection<AppointmentDoc>;
  bradescoMentors: Collection<BradescoMentorDoc>;
  bradescoReservations: Collection<BradescoReservationDoc>;
  outbox: Collection<OutboxDoc>;
  auditLogs: Collection<AuditLogDoc>;
  idempotencyKeys: Collection<IdempotencyDoc>;
  presenceChecks: Collection<PresenceCheckDoc>;
  whatsappInbound: Collection<WhatsappInboundDoc>;
  shortLinks: Collection<ShortLinkDoc>;
}

export function getCollections(db: Db): Collections {
  return {
    events: db.collection<EventDoc>(COLLECTIONS.events),
    users: db.collection<UserDoc>(COLLECTIONS.users),
    sessions: db.collection<SessionDoc>(COLLECTIONS.sessions),
    tables: db.collection<TableDoc>(COLLECTIONS.tables),
    mentees: db.collection<MenteeDoc>(COLLECTIONS.mentees),
    appointments: db.collection<AppointmentDoc>(COLLECTIONS.appointments),
    bradescoMentors: db.collection<BradescoMentorDoc>(COLLECTIONS.bradescoMentors),
    bradescoReservations: db.collection<BradescoReservationDoc>(COLLECTIONS.bradescoReservations),
    outbox: db.collection<OutboxDoc>(COLLECTIONS.outbox),
    auditLogs: db.collection<AuditLogDoc>(COLLECTIONS.auditLogs),
    idempotencyKeys: db.collection<IdempotencyDoc>(COLLECTIONS.idempotencyKeys),
    presenceChecks: db.collection<PresenceCheckDoc>(COLLECTIONS.presenceChecks),
    whatsappInbound: db.collection<WhatsappInboundDoc>(COLLECTIONS.whatsappInbound),
    shortLinks: db.collection<ShortLinkDoc>(COLLECTIONS.shortLinks),
  };
}
