import type { ObjectId } from 'mongodb';
import type {
  AppointmentStatus,
  MenteeStatus,
  OutboxChannel,
  OutboxStatus,
  OutboxType,
  PreferredPeriod,
  PriorityReason,
  Role,
  UserStatus,
} from '@tw/shared';

export type ActorRef = { userId: ObjectId | null; role: Role | 'mentee' | 'system' };

export interface EventSlotDoc {
  id: string;
  startAt: Date;
  endAt: Date;
}

export interface EventDoc {
  _id: string;
  name: string;
  date: string;
  location: string | null;
  timezone: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  gapMinutes: number;
  slots: EventSlotDoc[];
  responseWindowMinutes: number;
  minLeadMinutes: number;
  registrationOpen: boolean;
  areas: { key: string; label: string }[];
  templates: {
    registered: string;
    invite: string;
    confirmed: string;
    reminder: string;
    expired: string;
    cancelled: string;
  };
  /** Assuntos de e-mail editados em A7 (por id de layout); ausente = assunto padrão. */
  emailSubjects?: Partial<Record<string, string>>;
  consentVersion: string;
  version: number;
  updatedAt: Date;
}

export interface UserDoc {
  _id: ObjectId;
  name: string;
  email: string;
  roles: Role[];
  passwordHash: string;
  mustChangePassword: boolean;
  status: UserStatus;
  linkedin: string | null;
  organization: string | null;
  areas: string[];
  bio: string | null;
  photoUrl: string | null;
  availability: string[];
  lastLoginAt: Date | null;
  failedLogins: number;
  /** Início da janela de 10 min para contar as 5 falhas. */
  failedLoginWindowStart: Date | null;
  lockedUntil: Date | null;
  passwordChangedAt: Date | null;
  /** Contador usado na dedupeKey `pwd:<userId>:<n>`. */
  passwordResetCount: number;
  /** Fim da validade (72 h) da senha provisória; null quando não há senha provisória pendente. */
  tempPasswordExpiresAt?: Date | null;
  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}

export interface TableDoc {
  _id: ObjectId;
  eventId: string;
  number: number;
  name: string | null;
  location: string | null;
  active: boolean;
}

export interface MenteeDoc {
  _id: ObjectId;
  eventId: string;
  name: string;
  email: string;
  emailNorm: string;
  phone: string | null;
  linkedin: string | null;
  area: string;
  quizScores: Record<string, number>;
  preferredPeriod: PreferredPeriod;
  note: string | null;
  consent: { version: string; acceptedAt: Date } | null;
  status: MenteeStatus;
  priority: boolean;
  priorityReason: PriorityReason | null;
  queuedAt: Date;
  currentAppointmentId: ObjectId | null;
  /** Último desfecho (P6): declined_schedule | expired | cancelled_by_staff. */
  lastOutcome: 'declined_schedule' | 'expired' | 'cancelled_by_staff' | null;
  tokenHash: string;
  /** Versão do token derivado (HMAC); incrementar invalida o link antigo. */
  tokenVersion: number;
  /** Contador de envios do link pessoal (dedupeKey `registered:<menteeId>:<n>`). */
  linkSendCount: number;
  anonymizedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentHistoryDoc {
  from: AppointmentStatus | null;
  to: AppointmentStatus;
  by: { userId: ObjectId | null; role: Role | 'mentee' | 'system' };
  at: Date;
  reason: string | null;
}

export interface AppointmentDoc {
  _id: ObjectId;
  eventId: string;
  menteeId: ObjectId;
  mentorId: ObjectId;
  tableId: ObjectId;
  slotId: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  /** Presente (true) enquanto mesa e mentora estão ocupadas; ausente caso contrário. */
  slotLock?: true;
  /** Presente (true) enquanto a participante está ocupada; ausente caso contrário. */
  menteeLock?: true;
  expiresAt: Date | null;
  respondedAt: Date | null;
  declineReason: string | null;
  createdBy: { userId: ObjectId; role: 'mentor' | 'admin' | 'super_admin' };
  confirmedBy: { userId: ObjectId | null; role: Role | 'mentee' } | null;
  movedFromId: ObjectId | null;
  history: AppointmentHistoryDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboxDoc {
  _id: ObjectId;
  eventId: string;
  type: OutboxType;
  channel: OutboxChannel;
  to: string;
  menteeId: ObjectId | null;
  userId: ObjectId | null;
  appointmentId: ObjectId | null;
  payload: Record<string, unknown>;
  /** Segredo cifrado (AES-256-GCM) lido só pelo worker e removido ao marcar sent/failed/skipped. */
  secret?: { v: 1; iv: string; tag: string; ct: string };
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  sentAt: Date | null;
  lastError: string | null;
  dedupeKey: string;
  createdAt: Date;
}

export interface AuditLogDoc {
  _id: ObjectId;
  eventId: string;
  at: Date;
  actorId: ObjectId | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
}

export interface IdempotencyDoc {
  _id: string;
  requestHash: string;
  state: 'in_progress' | 'done';
  response: { status: number; body: unknown } | null;
  createdAt: Date;
}
