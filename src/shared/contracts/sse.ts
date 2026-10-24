import { z } from 'zod';
import { IdSchema } from './common.js';
import { AdminAppointmentViewSchema, MenteeAdminViewSchema, MentorAppointmentViewSchema, MenteeStaffViewSchema } from './entities.js';

// Eventos SSE. O `id:` de cada evento é o resume token do Change Stream (Last-Event-ID).
// Frames de controle: `event: ready` ao conectar e comentário `: ping` a cada 20 s.

/** Motivo pelo qual a participante saiu da fila (M4: aviso "Joana acabou de ser escolhida por outra mentora"). */
export const QUEUE_REMOVED_REASONS = ['invited', 'cancelled', 'no_longer_waiting'] as const;

// E27 · GET /mentor/stream
export const QueueAddedEventSchema = z.object({ mentee: MenteeStaffViewSchema });
export const QueueRemovedEventSchema = z.object({
  menteeId: IdSchema,
  menteeName: z.string(),
  reason: z.enum(QUEUE_REMOVED_REASONS),
  /** Nome da mentora que escolheu, quando outra mentora (não a própria). */
  byMentorName: z.string().nullable(),
  /** true quando foi a própria mentora que causou a saída (a tela não mostra aviso). */
  byMe: z.boolean(),
});
export const AppointmentUpdatedEventSchema = z.object({ appointment: MentorAppointmentViewSchema });

export const MentorStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queue.added'), data: QueueAddedEventSchema }),
  z.object({ type: z.literal('queue.removed'), data: QueueRemovedEventSchema }),
  z.object({ type: z.literal('appointment.updated'), data: AppointmentUpdatedEventSchema }),
]);
export type MentorStreamEvent = z.infer<typeof MentorStreamEventSchema>;
export const MENTOR_STREAM_EVENT_TYPES = ['queue.added', 'queue.removed', 'appointment.updated'] as const;

// E38 · GET /admin/stream (versão com contato)
export const AdminStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('appointment.updated'), data: z.object({ appointment: AdminAppointmentViewSchema }) }),
  z.object({ type: z.literal('mentee.updated'), data: z.object({ mentee: MenteeAdminViewSchema }) }),
  z.object({ type: z.literal('queue.added'), data: z.object({ mentee: MenteeAdminViewSchema }) }),
  z.object({ type: z.literal('queue.removed'), data: z.object({ menteeId: IdSchema }) }),
]);
export type AdminStreamEvent = z.infer<typeof AdminStreamEventSchema>;
export const ADMIN_STREAM_EVENT_TYPES = ['appointment.updated', 'mentee.updated', 'queue.added', 'queue.removed'] as const;
