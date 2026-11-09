import { ObjectId } from 'mongodb';
import type { ClientSession } from 'mongodb';
import type { MenteeStatus } from '@tw/shared';
import type { MenteeDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import type { Actor } from '../domain/index.js';
import { normalizeEmail } from '../domain/index.js';
import { writeAudit } from '../lib/audit.js';
import { enqueueMenteeNotifications } from '../lib/outbox.js';
import { hashMenteeToken, menteeToken } from '../lib/tokens.js';

/** Campos que a inscrição recebe de quem a preenche (P4 pela participante, M7 pela mentora). */
export type MenteeFields = Pick<MenteeDoc, 'name' | 'email' | 'phone' | 'linkedin' | 'area' | 'theme' | 'preferredPeriod' | 'note' | 'quizScores' | 'consent'>;

/**
 * Documento de uma inscrição nova (RN01): token derivado (versão 1), link enviado uma vez, sem prioridade.
 * `status` é `waiting` na inscrição pela participante (E02) e `done` no cadastro rápido do atendimento fora da mesa (E51).
 */
export function newMenteeDoc(ctx: AppContext, fields: MenteeFields, opts: { status: MenteeStatus; now: Date }): MenteeDoc {
  const _id = new ObjectId();
  const token = menteeToken(ctx.config.menteeTokenSecret, _id, 1);
  return {
    _id,
    eventId: ctx.config.eventId,
    ...fields,
    status: opts.status,
    priority: false,
    priorityReason: null,
    queuedAt: opts.now,
    currentAppointmentId: null,
    lastOutcome: null,
    emailNorm: normalizeEmail(fields.email),
    tokenHash: hashMenteeToken(token),
    tokenVersion: 1,
    linkSendCount: 1,
    anonymizedAt: null,
    version: 1,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

/**
 * Grava a inscrição nova, o e-mail com o link pessoal (`registered`) e a auditoria na transação em andamento.
 * `registered: false` no cadastro rápido do atendimento fora da mesa (E51): ela recebe só o `walk_in_done`, que já
 * leva o link pessoal. Duplicate key (`mentee_event_email`) sobe para quem chamou tratar a corrida (RN01).
 */
export async function insertNewMentee(
  ctx: AppContext,
  session: ClientSession,
  doc: MenteeDoc,
  audit: { actor: Actor; action: 'mentee.register' | 'mentee.register_by_staff'; ip: string | null; after?: Record<string, unknown>; registered?: boolean },
): Promise<void> {
  await ctx.c.mentees.insertOne(doc, { session });
  if (audit.registered !== false) await enqueueMenteeNotifications(ctx, session, { type: 'registered', mentee: doc, dedupeSuffix: doc.linkSendCount });
  await writeAudit(ctx, session, { actor: audit.actor, action: audit.action, entity: 'mentee', entityId: doc._id, after: { status: doc.status, area: doc.area, ...audit.after }, ip: audit.ip });
}
