import { z } from 'zod';

// ---------------------------------------------------------------------------
// Convenções gerais
// ---------------------------------------------------------------------------

/** Todas as rotas ficam sob /api (nginx faz proxy). Os paths dos endpoints não incluem o prefixo. */
export const API_PREFIX = '/api';

export const HEADERS = {
  menteeToken: 'X-Mentee-Token',
  idempotencyKey: 'Idempotency-Key',
  requestedWith: 'X-Requested-With',
  turnstile: 'X-Turnstile-Token',
  /** E47: HMAC-SHA512 em hex do corpo bruto, assinado pelo WAHA (chave WAHA_WEBHOOK_HMAC_KEY). */
  wahaHmac: 'X-Webhook-Hmac',
} as const;

/** Valor exigido no header X-Requested-With nas rotas que escrevem (proteção CSRF). */
export const REQUESTED_WITH_VALUE = 'tw-web';

export const SESSION_COOKIE = 'sid';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ROLES = ['mentor', 'admin', 'super_admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const USER_STATUSES = ['active', 'disabled'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** Status da mentoria (appointments.status). */
export const APPOINTMENT_STATUSES = [
  'invited',
  'confirmed',
  'in_progress',
  'done',
  'no_show',
  'declined',
  'expired',
  'cancelled',
] as const;
export const AppointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

/** Status "ativos" (ocupam mesa, mentora e participante): slotLock e menteeLock verdadeiros. */
export const ACTIVE_APPOINTMENT_STATUSES = ['invited', 'confirmed', 'in_progress'] as const;

/** Status da participante (mentees.status). */
export const MENTEE_STATUSES = ['waiting', 'invited', 'confirmed', 'done', 'no_show', 'cancelled'] as const;
export const MenteeStatusSchema = z.enum(MENTEE_STATUSES);
export type MenteeStatus = z.infer<typeof MenteeStatusSchema>;

export const PREFERRED_PERIODS = ['morning', 'early_afternoon', 'late_afternoon', 'any'] as const;
export const PreferredPeriodSchema = z.enum(PREFERRED_PERIODS);
export type PreferredPeriod = z.infer<typeof PreferredPeriodSchema>;

export const PRIORITY_REASONS = ['declined_schedule', 'cancelled_by_staff', 'manual'] as const;
export const PriorityReasonSchema = z.enum(PRIORITY_REASONS);
export type PriorityReason = z.infer<typeof PriorityReasonSchema>;

export const OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'failed', 'skipped'] as const;
export const OutboxStatusSchema = z.enum(OUTBOX_STATUSES);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const OUTBOX_CHANNELS = ['email', 'whatsapp'] as const;
export const OutboxChannelSchema = z.enum(OUTBOX_CHANNELS);
export type OutboxChannel = z.infer<typeof OutboxChannelSchema>;

export const OUTBOX_TYPES = [
  'registered',
  'invite',
  'confirmed',
  'reminder',
  'expired',
  'cancelled',
  'moved',
  // inscrição cancelada pela própria participante (E04 cancel ou recusa "Não tenho mais interesse")
  'registration_cancelled',
  // horário liberado pela própria participante, que volta à fila com prioridade (E04 decline schedule/reschedule, RN18 "Não vou")
  'slot_released',
  // aviso à mentora: a participante liberou o horário dela (cancelou a confirmada, recusou ou cancelou com convite pendente)
  'mentor_slot_released',
  'staff_password',
  // respostas à confirmação de presença pelo WhatsApp (RN18)
  'presence_confirmed',
  'presence_cancelled',
  'presence_unclear',
  // respostas ao convite pelo WhatsApp (RN20)
  'invite_closed',
  'invite_decline_link',
  'invite_unclear',
] as const;
export const OutboxTypeSchema = z.enum(OUTBOX_TYPES);
export type OutboxType = z.infer<typeof OutboxTypeSchema>;

/** `payload.reason` do `mentor_slot_released` (PLAN, Notificações > Aviso à mentora). */
export const MENTOR_SLOT_RELEASED_REASONS = ['confirmed_cancelled', 'invite_declined', 'invite_cancelled'] as const;
export type MentorSlotReleasedReason = (typeof MENTOR_SLOT_RELEASED_REASONS)[number];
export const isMentorSlotReleasedReason = (v: unknown): v is MentorSlotReleasedReason =>
  (MENTOR_SLOT_RELEASED_REASONS as readonly unknown[]).includes(v);
/**
 * Frase do motivo do aviso à mentora, a mesma no e-mail (`{{motivo}}` do layout 9) e no WhatsApp (UI-SPEC, Mensagens
 * enviadas). Placeholders `{nome}`, `{horario}` e `{mesa}`; sem ponto final, que cada canal fecha do seu jeito.
 */
export const MENTOR_SLOT_RELEASED_TEXT: Record<MentorSlotReleasedReason, string> = {
  confirmed_cancelled: '{nome} cancelou a mentoria das {horario} na {mesa}. O horário voltou a ficar livre na sua agenda',
  invite_declined: '{nome} recusou o convite para as {horario}. O horário voltou a ficar livre e você pode convidar outra pessoa da fila',
  invite_cancelled: '{nome} cancelou a inscrição e o convite para as {horario} foi encerrado. O horário voltou a ficar livre e você pode convidar outra pessoa da fila',
};

/** Motivos de recusa em E04 (RN06). */
export const DECLINE_REASONS = ['schedule', 'no_interest'] as const;
export const DeclineReasonSchema = z.enum(DECLINE_REASONS);
export type DeclineReason = z.infer<typeof DeclineReasonSchema>;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  // conflitos de agenda (409)
  'MENTEE_TAKEN',
  'TABLE_TAKEN',
  'MENTOR_BUSY',
  'SLOT_UNAVAILABLE',
  // convite / inscrição
  'INVITE_EXPIRED',
  'ALREADY_REGISTERED',
  'REGISTRATION_CLOSED',
  'INVALID_STATE',
  'TOO_EARLY',
  // regras de configuração
  'SLOT_IN_USE',
  'GRID_LOCKED',
  'TABLE_IN_USE',
  'MENTOR_HAS_APPOINTMENTS',
  'LAST_SUPER_ADMIN',
  'EMAIL_TAKEN',
  // autenticação e acesso
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'PASSWORD_CHANGE_REQUIRED',
  'TEMP_PASSWORD_EXPIRED',
  'WEAK_PASSWORD',
  'FORBIDDEN',
  'CSRF',
  'TURNSTILE_FAILED',
  // genéricos
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Formato único de erro: { code, message }. `details` é opcional (ex.: lista de mentorias para realocar, RN12). */
export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** Status HTTP padrão de cada código de erro. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  MENTEE_TAKEN: 409,
  TABLE_TAKEN: 409,
  MENTOR_BUSY: 409,
  SLOT_UNAVAILABLE: 409,
  INVITE_EXPIRED: 409,
  ALREADY_REGISTERED: 200,
  REGISTRATION_CLOSED: 403,
  INVALID_STATE: 409,
  TOO_EARLY: 409,
  SLOT_IN_USE: 409,
  GRID_LOCKED: 409,
  TABLE_IN_USE: 409,
  MENTOR_HAS_APPOINTMENTS: 409,
  LAST_SUPER_ADMIN: 409,
  EMAIL_TAKEN: 409,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_LOCKED: 423,
  PASSWORD_CHANGE_REQUIRED: 403,
  TEMP_PASSWORD_EXPIRED: 403,
  WEAK_PASSWORD: 422,
  FORBIDDEN: 403,
  CSRF: 403,
  TURNSTILE_FAILED: 403,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

/** Códigos de conflito de agenda devolvidos por E24 e E39 (409). */
export const SCHEDULE_CONFLICT_CODES = ['MENTEE_TAKEN', 'TABLE_TAKEN', 'MENTOR_BUSY', 'SLOT_UNAVAILABLE'] as const;

// ---------------------------------------------------------------------------
// Primitivos reutilizáveis
// ---------------------------------------------------------------------------

/** ObjectId ou id textual, sempre serializado como string. */
export const IdSchema = z.string().min(1).max(64);
export const IsoDateTimeSchema = z.string().describe('ISO 8601 em UTC');
export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
/** Telefone brasileiro: aceita máscara; a API normaliza para E.164 (+55...). */
export const PhoneInputSchema = z.string().trim().min(10).max(20);
export const PhoneE164Schema = z.string().regex(/^\+[1-9]\d{9,14}$/);

/** Telefone brasileiro (com ou sem máscara/+55) para E.164. Devolve null se inválido. Participante (E02) e mentora (E28, E31–E33). */
export function normalizePhoneBR(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return `+55${d}`;
}
export const LinkedinInputSchema = z.string().trim().max(200);
export const AreaKeySchema = z.string().trim().min(1).max(40);
export const SlotIdSchema = z.string().min(1).max(16);

export const PASSWORD_MIN_LENGTH = 10;
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(128);

export const MENTEE_NOTE_MAX = 280;
export const MENTOR_BIO_MAX = 1500;

/** Temas comerciais da mentora (Tema 1 e Tema 2), texto livre; substituem as áreas no perfil. */
export const MENTOR_THEMES_MAX = 2;
export const MENTOR_THEME_MAX = 120;
export const MentorThemesSchema = z.array(z.string().trim().min(1).max(MENTOR_THEME_MAX)).max(MENTOR_THEMES_MAX);

export const SlotSchema = z.object({
  id: SlotIdSchema,
  startAt: IsoDateTimeSchema,
  endAt: IsoDateTimeSchema,
});
export type Slot = z.infer<typeof SlotSchema>;

export const AreaSchema = z.object({ key: AreaKeySchema, label: z.string().min(1).max(80) }).strict();
export type Area = z.infer<typeof AreaSchema>;

/** Paginação por cursor (E22, E35, E44, E45). */
export const CursorQuerySchema = z.object({ cursor: z.string().max(500).optional() });
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null };

export const QUEUE_PAGE_SIZE = 30;

export const OkSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof OkSchema>;

/** Query string booleana ("true"/"false"). */
export const QueryBoolSchema = z.enum(['true', 'false']).transform((v) => v === 'true');

// ---------------------------------------------------------------------------
// Definição tipada de endpoint (usada pelo cliente HTTP do ui-kit e pelas rotas)
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Busca livre (`q`) de E22, E31 e E35: de 2 a 200 caracteres. */
export const SEARCH_Q_MIN = 2;
export const SEARCH_Q_MAX = 200;
export const SearchQSchema = z.string().trim().min(SEARCH_Q_MIN).max(SEARCH_Q_MAX);

export type EndpointAuth = 'public' | 'mentee' | 'staff';

export interface EndpointDef<
  Params extends z.ZodType | undefined = z.ZodType | undefined,
  Query extends z.ZodType | undefined = z.ZodType | undefined,
  Body extends z.ZodType | undefined = z.ZodType | undefined,
  Res extends z.ZodType | undefined = z.ZodType | undefined,
> {
  /** Código do SDD, ex.: "E24". */
  readonly code: string;
  readonly method: HttpMethod;
  /** Path sem o prefixo /api, com `:param`. */
  readonly path: string;
  readonly auth: EndpointAuth;
  /** Papéis aceitos quando auth = "staff" (qualquer um da lista). */
  readonly roles?: readonly Role[];
  /** Aceita o header Idempotency-Key. */
  readonly idempotent?: boolean;
  /** Exige Turnstile (header X-Turnstile-Token ou campo do corpo). */
  readonly turnstile?: boolean;
  /** `false`: rota pública que escreve sem a checagem anti-CSRF (webhook de servidor, E47). */
  readonly csrf?: false;
  readonly params?: Params;
  readonly query?: Query;
  readonly body?: Body;
  /** Schema da resposta de sucesso (corpo JSON). */
  readonly response?: Res;
  /** Resposta que não é JSON (SSE, CSV, PNG/SVG). */
  readonly contentType?: string;
}

export function defineEndpoint<
  Params extends z.ZodType | undefined = undefined,
  Query extends z.ZodType | undefined = undefined,
  Body extends z.ZodType | undefined = undefined,
  Res extends z.ZodType | undefined = undefined,
>(def: EndpointDef<Params, Query, Body, Res>): EndpointDef<Params, Query, Body, Res> {
  return def;
}

type Present<T> = Exclude<T, undefined>;
type InferOrNever<T> = [Present<T>] extends [never] ? undefined : Present<T> extends z.ZodType ? z.infer<Present<T>> : undefined;
type InferInOrNever<T> = [Present<T>] extends [never] ? undefined : Present<T> extends z.ZodType ? z.input<Present<T>> : undefined;

/** Tipos auxiliares para o cliente HTTP. */
export type ParamsOf<E extends EndpointDef> = InferOrNever<E['params']>;
export type QueryOf<E extends EndpointDef> = InferInOrNever<E['query']>;
export type BodyOf<E extends EndpointDef> = InferInOrNever<E['body']>;
export type ResponseOf<E extends EndpointDef> = InferOrNever<E['response']>;

/** Substitui `:param` do path. Ex.: buildPath("/mentor/appointments/:id", { id: "x" }). */
export function buildPath(path: string, params?: Record<string, string | number>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
    const v = params?.[name];
    if (v === undefined) throw new Error(`Parâmetro de rota ausente: ${name}`);
    return encodeURIComponent(String(v));
  });
}

/** Path completo (com /api) para uso no cliente. */
export function fullPath(path: string, params?: Record<string, string | number>): string {
  return API_PREFIX + buildPath(path, params);
}

export const IdParamsSchema = z.object({ id: IdSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

/** `details.reason` de SLOT_UNAVAILABLE (RN04). */
export const SLOT_UNAVAILABLE_REASONS = ['not_in_event', 'not_available', 'lead_time', 'mentor_inactive', 'table_inactive'] as const;
export type SlotUnavailableReason = (typeof SLOT_UNAVAILABLE_REASONS)[number];
