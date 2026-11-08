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
  /** Textos das mensagens de WhatsApp, legado (canal removido em 2026-11-05): continua gravado, ninguém lê. */
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
  /**
   * Lembretes antes de cada mentoria (A7), sempre por e-mail; ausente = um lembrete 15 min antes (RN15). Eventos antigos
   * podem ter `whatsapp` em `channels` (legado): a API ignora o canal e grava sempre `['email']`.
   */
  reminders?: { minutesBefore: number; channels: ('email' | 'whatsapp')[] }[];
  /** Menus do WhatsApp (RN18, RN20), legado: removidos em 2026-11-05; ninguém lê e E41 apaga ao salvar. */
  whatsappLists?: unknown;
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
  /** Celular da mentora (E.164), opcional; ausente em contas antigas = sem telefone. Os avisos vão só por e-mail. */
  phone?: string | null;
  organization: string | null;
  areas: string[];
  /** Temas comerciais (Tema 1 e 2); ausente em contas antigas = sem temas. */
  themes?: string[];
  /** Domínios de cada tema (mesmo índice de `themes`), vindos da planilha do Bradesco. */
  themeDomains?: string[][];
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
  /** `collectedBy`: mentora que colheu o aceite no cadastro rápido (RN21, E51); ausente na inscrição pela própria participante. */
  consent: { version: string; acceptedAt: Date; collectedBy?: ObjectId } | null;
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

/**
 * Avaliação da participante depois da mentoria concluída (E09, P6). Uma por participante (`_id` = menteeId), sem
 * edição. Sem validador (a coleção nasce sozinha em `createIndexes`); o corpo já é validado pelo Zod de E09.
 * O comentário é texto livre: a anonimização (E36) apaga o documento.
 */
export interface FeedbackDoc {
  /** = menteeId */
  _id: ObjectId;
  eventId: string;
  /** Mentoria concluída avaliada. */
  appointmentId: ObjectId | null;
  /** Atendimento fora da mesa avaliado (RN21), quando ela foi concluída assim; ausente em avaliações antigas. */
  walkInId?: ObjectId | null;
  /** Mentora avaliada (da mentoria ou do atendimento fora da mesa); ausente em avaliações antigas (A10 lê da mentoria). */
  mentorId?: ObjectId | null;
  /** Notas de 1 a 5. */
  ratings: { event: number; talk: number; mentoring: number };
  comment: string | null;
  createdAt: Date;
}

/**
 * RN21 · Atendimento fora da mesa: mentoria rápida que a mentora fez com a participante fora das mesas e da grade.
 * Não cria `appointments`, não usa mesa nem horário. Sem validador (como `feedbacks`). Um ativo por mentora e
 * participante (`walkin_pair_active`); a remoção pelo admin (E53) é lógica (`deletedAt`).
 */
export interface WalkInDoc {
  _id: ObjectId;
  eventId: string;
  menteeId: ObjectId;
  mentorId: ObjectId;
  /** Hora do registro (relógio do servidor). */
  at: Date;
  note: string | null;
  /** Status da participante antes do atendimento; null quando ela foi cadastrada agora (E51 `created`). */
  previousMenteeStatus: MenteeStatus | null;
  createdBy: ObjectId;
  createdAt: Date;
  deletedAt: Date | null;
  deletedBy: ObjectId | null;
}

/**
 * RN22 · Trava por horário da disponibilidade (coleção `slot_counters`, `_id` = `<eventId>:<slotId>`). Toda gravação
 * de E21 que ADICIONA um horário incrementa `n` desse horário dentro da transação, antes de contar as mentoras: duas
 * mentoras salvando o mesmo horário ao mesmo tempo geram conflito de escrita no mesmo documento, e a que perde repete
 * a transação e reconta já vendo a outra. `n` não é a contagem de mentoras, só o contador de gravações.
 */
export interface SlotCounterDoc {
  _id: string;
  eventId: string;
  slotId: string;
  n: number;
  updatedAt: Date;
}
