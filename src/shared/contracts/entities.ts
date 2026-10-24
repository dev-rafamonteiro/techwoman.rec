import { z } from 'zod';
import { EmailPreviewTypeSchema } from './E46-admin-email-preview.js';
import {
  AppointmentStatusSchema,
  AreaSchema,
  AreaKeySchema,
  EmailSchema,
  IdSchema,
  IsoDateTimeSchema,
  MenteeStatusSchema,
  OutboxChannelSchema,
  OutboxStatusSchema,
  OutboxTypeSchema,
  PhoneE164Schema,
  PreferredPeriodSchema,
  PriorityReasonSchema,
  RoleSchema,
  SlotSchema,
  UserStatusSchema,
} from './common.js';

// Visões (DTOs) compartilhadas entre endpoints. Nenhuma visão de mentora contém e-mail, telefone ou consent (LGPD, matriz de permissões).

export const TableViewSchema = z.object({
  id: IdSchema,
  number: z.number().int().min(1),
  name: z.string().nullable(),
  location: z.string().nullable(),
  active: z.boolean(),
});
export type TableView = z.infer<typeof TableViewSchema>;

export const TableRefSchema = z.object({
  id: IdSchema,
  number: z.number().int(),
  name: z.string().nullable(),
  location: z.string().nullable(),
});
export type TableRef = z.infer<typeof TableRefSchema>;

/** Mentora como a participante enxerga (nunca organização, e-mail). */
export const MentorCardSchema = z.object({
  id: IdSchema,
  name: z.string(),
  photoUrl: z.string().nullable(),
  linkedin: z.string().nullable(),
  areas: z.array(AreaKeySchema),
});
export type MentorCard = z.infer<typeof MentorCardSchema>;

/** Participante sem contato: o que a mentora pode ver (M4, M5, M6). */
export const MenteeStaffViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  area: AreaKeySchema,
  preferredPeriod: PreferredPeriodSchema,
  linkedin: z.string().nullable(),
  note: z.string().nullable(),
  priority: z.boolean(),
  priorityReason: PriorityReasonSchema.nullable(),
  status: MenteeStatusSchema,
  queuedAt: IsoDateTimeSchema,
});
export type MenteeStaffView = z.infer<typeof MenteeStaffViewSchema>;

/** Participante com contato: só admin e super admin (A4). */
export const MenteeAdminViewSchema = MenteeStaffViewSchema.extend({
  email: z.string(),
  phone: PhoneE164Schema.nullable(),
  consent: z.object({ version: z.string(), acceptedAt: IsoDateTimeSchema }).nullable(),
  quizScores: z.record(z.string(), z.number()),
  createdAt: IsoDateTimeSchema,
  currentAppointmentId: IdSchema.nullable(),
  mentorName: z.string().nullable(),
  table: TableRefSchema.nullable(),
  slot: SlotSchema.nullable(),
});
export type MenteeAdminView = z.infer<typeof MenteeAdminViewSchema>;

export const AppointmentHistoryEntrySchema = z.object({
  from: AppointmentStatusSchema.nullable(),
  to: AppointmentStatusSchema,
  by: z.object({ userId: IdSchema.nullable(), role: z.enum(['mentee', 'mentor', 'admin', 'super_admin', 'system']) }),
  at: IsoDateTimeSchema,
  reason: z.string().nullable(),
});
export type AppointmentHistoryEntry = z.infer<typeof AppointmentHistoryEntrySchema>;

/** Mentoria vista pela mentora (M6): participante sem contato. */
export const MentorAppointmentViewSchema = z.object({
  id: IdSchema,
  status: AppointmentStatusSchema,
  slotId: z.string(),
  startAt: IsoDateTimeSchema,
  endAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  table: TableRefSchema,
  mentee: MenteeStaffViewSchema,
  createdBy: z.object({ userId: IdSchema, role: z.enum(['mentor', 'admin', 'super_admin']) }),
  respondedAt: IsoDateTimeSchema.nullable(),
  declineReason: z.string().nullable(),
});
export type MentorAppointmentView = z.infer<typeof MentorAppointmentViewSchema>;

/** Mentoria vista pelo admin (A4, A5): inclui mentora, contato e histórico. */
export const AdminAppointmentViewSchema = z.object({
  id: IdSchema,
  status: AppointmentStatusSchema,
  slotId: z.string(),
  startAt: IsoDateTimeSchema,
  endAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  table: TableRefSchema,
  mentor: z.object({ id: IdSchema, name: z.string() }),
  mentee: MenteeAdminViewSchema,
  createdBy: z.object({ userId: IdSchema, role: z.enum(['mentor', 'admin', 'super_admin']) }),
  history: z.array(AppointmentHistoryEntrySchema),
});
export type AdminAppointmentView = z.infer<typeof AdminAppointmentViewSchema>;

/** Mentoria vista pela participante (P6). */
export const MenteeAppointmentViewSchema = z.object({
  id: IdSchema,
  status: AppointmentStatusSchema,
  mentor: MentorCardSchema,
  table: TableRefSchema,
  slot: SlotSchema,
  durationMinutes: z.number().int(),
  expiresAt: IsoDateTimeSchema.nullable(),
});
export type MenteeAppointmentView = z.infer<typeof MenteeAppointmentViewSchema>;

/** Usuário de staff (mentora/admin/super admin). */
export const UserViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  email: z.string(),
  roles: z.array(RoleSchema),
  status: UserStatusSchema,
  linkedin: z.string().nullable(),
  organization: z.string().nullable(),
  areas: z.array(AreaKeySchema),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  availability: z.array(z.string()),
  mustChangePassword: z.boolean(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type UserView = z.infer<typeof UserViewSchema>;

export const MentorListItemSchema = UserViewSchema.extend({
  availableSlots: z.number().int(),
  confirmedCount: z.number().int(),
  doneCount: z.number().int(),
  /** Derivado: "Ativa" | "Desativada" | "Nunca acessou" fica a cargo da tela; aqui só o fato. */
  neverLoggedIn: z.boolean(),
});
export type MentorListItem = z.infer<typeof MentorListItemSchema>;

export const OutboxItemViewSchema = z.object({
  id: IdSchema,
  type: OutboxTypeSchema,
  channel: OutboxChannelSchema,
  to: z.string().describe('Destino mascarado'),
  menteeId: IdSchema.nullable(),
  appointmentId: IdSchema.nullable(),
  status: OutboxStatusSchema,
  attempts: z.number().int(),
  nextAttemptAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type OutboxItemView = z.infer<typeof OutboxItemViewSchema>;

export const AuditEntryViewSchema = z.object({
  id: IdSchema,
  at: IsoDateTimeSchema,
  actorId: IdSchema.nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
});
export type AuditEntryView = z.infer<typeof AuditEntryViewSchema>;

/** Lembretes antes de cada mentoria (A7): até 10, cada um com minutos antes do início e canais. */
export const MAX_REMINDERS = 10;
export const ReminderChannelSchema = z.enum(['email', 'whatsapp']);
export const ReminderRuleSchema = z
  .object({ minutesBefore: z.number().int().min(1).max(1440), channels: z.array(ReminderChannelSchema).min(1).max(2) })
  .strict();
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;
/** Padrão (RN15): 15 min antes, pelo WhatsApp (e-mail se não houver WhatsApp). */
export const DEFAULT_REMINDERS: ReminderRule[] = [{ minutesBefore: 15, channels: ['whatsapp'] }];

export const EventConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().max(200).nullable(),
  timezone: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(5).max(180),
  gapMinutes: z.number().int().min(0).max(60),
  slots: z.array(SlotSchema),
  responseWindowMinutes: z.number().int().min(1).max(120),
  minLeadMinutes: z.number().int().min(0).max(120),
  registrationOpen: z.boolean(),
  areas: z.array(AreaSchema),
  templates: z
    .object({
      registered: z.string().max(1000),
      invite: z.string().max(1000),
      confirmed: z.string().max(1000),
      reminder: z.string().max(1000),
      expired: z.string().max(1000),
      cancelled: z.string().max(1000),
    })
    .strict(),
  /** Assuntos dos e-mails que substituem os padrões, por layout (aceitam `{{variavel}}` do layout). */
  emailSubjects: z.partialRecord(EmailPreviewTypeSchema, z.string().trim().min(1).max(200)).optional(),
  /** Lembretes antes de cada mentoria; ausente = DEFAULT_REMINDERS. Minutos não se repetem. */
  reminders: z
    .array(ReminderRuleSchema)
    .max(MAX_REMINDERS)
    .refine((r) => new Set(r.map((x) => x.minutesBefore)).size === r.length, { message: 'Cada lembrete precisa de um tempo diferente.' })
    .optional(),
  version: z.number().int(),
});
export type EventConfig = z.infer<typeof EventConfigSchema>;
