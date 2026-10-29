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
  /** Lembretes antes de cada mentoria (A7); ausente = um lembrete 15 min antes pelo WhatsApp (RN15). */
  reminders?: { minutesBefore: number; channels: ('email' | 'whatsapp')[] }[];
  /** Título e texto das List Messages do WhatsApp (A7); ausente = padrão de `@tw/shared` (RN18, RN20). */
  whatsappLists?: { invite: { title: string; description: string }; presence: { title: string; description: string } };
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
  /** WhatsApp da mentora (E.164), opcional; ausente em contas antigas = sem telefone (avisos só por e-mail). */
  phone?: string | null;
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

export interface BradescoMentorDoc {
  _id: ObjectId;
  name: string;
  expertise: string;
  city: string;
  linkedin: string | null;
  bio: string;
  photoUrl: string | null;
  themes: { name: string; domains: string[] }[];
  slots: { id: string; time: string; topic: string }[];
  active: boolean;
  scheduleVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BradescoReservationDoc {
  _id: ObjectId;
  eventId: string;
  mentorId: ObjectId;
  slotId: string;
  name: string;
  email: string;
  phone: string;
  consentVersion: string;
  consentAt: Date;
  createdAt: Date;
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

export type PresenceCheckStatus = 'pending' | 'confirmed' | 'cancelled' | 'closed';
export type PresenceInterpretation = 'confirm' | 'cancel';
/** `invite` = convite (RN20); `presence` = confirmação de presença (RN18). */
export type PresenceCheckKind = 'invite' | 'presence';

/**
 * Pergunta enviada pelo WhatsApp com resposta direta, uma por mentoria: convite (RN20) e confirmação de presença
 * (RN18; o lembrete substitui o registro do convite). Sem validador.
 */
export interface PresenceCheckDoc {
  /** = appointmentId */
  _id: ObjectId;
  /** Ausente (registros antigos) = `presence`. */
  kind?: PresenceCheckKind;
  menteeId: ObjectId;
  /** Só dígitos, ex.: `5511996604159`. */
  phone: string;
  /** Hash final do id da mensagem enviada pelo WAHA (`true_<chatId>_<hash>`). */
  messageId: string;
  status: PresenceCheckStatus;
  sentAt: Date;
  answeredAt: Date | null;
  answer: { kind: 'list' | 'text'; text: string | null; interpretation: PresenceInterpretation | null } | null;
}

/** Mensagem recebida do WAHA já processada (deduplicação do webhook E47). Sem validador; TTL em `expireAt`. */
export interface WhatsappInboundDoc {
  /** Hash final do id da mensagem recebida. */
  _id: string;
  receivedAt: Date;
  expireAt: Date;
  phone: string;
  result: PresenceInterpretation | 'unclear' | 'ignored';
}

/** `personal` leva a P6 (`/mentoria/minha?t=`); `calendar` leva ao `.ics` de E06. */
export type ShortLinkKind = 'personal' | 'calendar';

/**
 * Link curto `/l/<código>` (E48) para o link com o token da participante. Sem validador e sem TTL; o token não é
 * gravado (E48 o deriva na hora). Um por participante, tipo e `tokenVersion` (`short_link_mentee_kind_version`).
 */
export interface ShortLinkDoc {
  /** Código de 7 caracteres base62. */
  _id: string;
  menteeId: ObjectId;
  kind: ShortLinkKind;
  /** `tokenVersion` da participante quando o link foi criado; diferente do atual = revogado. */
  tokenVersion: number;
  createdAt: Date;
  /** Fim do evento + 7 dias (TTL `short_link_ttl`); E48 também confere. */
  expireAt: Date;
}

export interface ExtraSessionDoc {
  _id: ObjectId;
  eventId: string;
  mentorId: ObjectId;
  menteeId: ObjectId;
  mentee: {
    name: string;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    area: string;
    preferredPeriod: PreferredPeriod;
    note: string | null;
    consent: { version: string; acceptedAt: Date } | null;
  };
  slotId: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
}
