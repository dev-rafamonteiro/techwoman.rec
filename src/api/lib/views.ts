import type { ObjectId } from 'mongodb';
import type {
  AdminAppointmentView,
  AppointmentHistoryEntry,
  MenteeAdminView,
  MenteeAppointmentView,
  MenteeStaffView,
  MentorAppointmentView,
  MentorCard,
  OutboxItemView,
  Slot,
  TableRef,
  TableView,
  UserView,
} from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, TableDoc, UserDoc } from '@tw/db';

export const iso = (d: Date): string => d.toISOString();
const isoN = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const id = (o: ObjectId | string): string => String(o);

export function slotOf(event: EventDoc, slotId: string): Slot {
  const s = event.slots.find((x) => x.id === slotId);
  if (!s) return { id: slotId, startAt: '', endAt: '' };
  return { id: s.id, startAt: iso(s.startAt), endAt: iso(s.endAt) };
}

export const toSlot = (s: EventDoc['slots'][number]): Slot => ({ id: s.id, startAt: iso(s.startAt), endAt: iso(s.endAt) });

export function toTableRef(t: TableDoc): TableRef {
  return { id: id(t._id), number: t.number, name: t.name, location: t.location };
}
export function toTableView(t: TableDoc): TableView {
  return { ...toTableRef(t), active: t.active };
}

/** Participante sem contato (e-mail, telefone, consent): visão da mentora. */
export function toMenteeStaffView(m: MenteeDoc): MenteeStaffView {
  return {
    id: id(m._id),
    name: m.name,
    area: m.area,
    preferredPeriod: m.preferredPeriod,
    linkedin: m.linkedin,
    note: m.note,
    priority: m.priority,
    priorityReason: m.priorityReason,
    status: m.status,
    queuedAt: iso(m.queuedAt),
  };
}

export function toMenteeAdminView(
  m: MenteeDoc,
  extra: { appointment?: AppointmentDoc | null; mentorName?: string | null; table?: TableDoc | null; event?: EventDoc } = {},
): MenteeAdminView {
  const a = extra.appointment ?? null;
  return {
    ...toMenteeStaffView(m),
    email: m.email,
    phone: m.phone as MenteeAdminView['phone'],
    consent: m.consent ? { version: m.consent.version, acceptedAt: iso(m.consent.acceptedAt) } : null,
    quizScores: m.quizScores,
    createdAt: iso(m.createdAt),
    currentAppointmentId: m.currentAppointmentId ? id(m.currentAppointmentId) : null,
    mentorName: extra.mentorName ?? null,
    table: extra.table ? toTableRef(extra.table) : null,
    slot: a && extra.event ? slotOf(extra.event, a.slotId) : null,
  };
}

export function toMentorCard(u: UserDoc): MentorCard {
  return { id: id(u._id), name: u.name, photoUrl: u.photoUrl, linkedin: u.linkedin, areas: u.areas };
}

export function toUserView(u: UserDoc): UserView {
  return {
    id: id(u._id),
    name: u.name,
    email: u.email,
    roles: u.roles,
    status: u.status,
    linkedin: u.linkedin,
    organization: u.organization,
    areas: u.areas,
    bio: u.bio,
    photoUrl: u.photoUrl,
    availability: u.availability,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: isoN(u.lastLoginAt),
    createdAt: iso(u.createdAt),
  };
}

export function toMentorAppointmentView(a: AppointmentDoc, mentee: MenteeDoc, table: TableDoc): MentorAppointmentView {
  return {
    id: id(a._id),
    status: a.status,
    slotId: a.slotId,
    startAt: iso(a.startAt),
    endAt: iso(a.endAt),
    expiresAt: isoN(a.expiresAt),
    table: toTableRef(table),
    mentee: toMenteeStaffView(mentee),
    createdBy: { userId: id(a.createdBy.userId), role: a.createdBy.role },
    respondedAt: isoN(a.respondedAt),
    declineReason: a.declineReason,
  };
}

const historyOf = (a: AppointmentDoc): AppointmentHistoryEntry[] =>
  a.history.map((h) => ({
    from: h.from,
    to: h.to,
    by: { userId: h.by.userId ? id(h.by.userId) : null, role: h.by.role },
    at: iso(h.at),
    reason: h.reason,
  }));

export function toAdminAppointmentView(a: AppointmentDoc, mentee: MenteeDoc, mentor: Pick<UserDoc, '_id' | 'name'>, table: TableDoc, event: EventDoc): AdminAppointmentView {
  return {
    id: id(a._id),
    status: a.status,
    slotId: a.slotId,
    startAt: iso(a.startAt),
    endAt: iso(a.endAt),
    expiresAt: isoN(a.expiresAt),
    table: toTableRef(table),
    mentor: { id: id(mentor._id), name: mentor.name },
    mentee: toMenteeAdminView(mentee, { appointment: a, mentorName: mentor.name, table, event }),
    createdBy: { userId: id(a.createdBy.userId), role: a.createdBy.role },
    history: historyOf(a),
  };
}

/** Participante: convite vencido pelo relógio já aparece como `expired`, mesmo antes de o worker rodar. */
export function toMenteeAppointmentView(a: AppointmentDoc, mentor: UserDoc, table: TableDoc, event: EventDoc, now: Date): MenteeAppointmentView {
  const lapsed = a.status === 'invited' && a.expiresAt !== null && a.expiresAt.getTime() <= now.getTime();
  return {
    id: id(a._id),
    status: lapsed ? 'expired' : a.status,
    mentor: toMentorCard(mentor),
    table: toTableRef(table),
    slot: slotOf(event, a.slotId),
    durationMinutes: event.slotMinutes,
    expiresAt: isoN(a.expiresAt),
  };
}

export function maskDestination(to: string): string {
  if (to.includes('@')) {
    const [u = '', d = ''] = to.split('@');
    return `${u.slice(0, 1)}***@${d.slice(0, 1)}***${d.includes('.') ? d.slice(d.indexOf('.')) : ''}`;
  }
  return `${to.slice(0, 3)}*****${to.slice(-2)}`;
}

export function toOutboxItemView(o: OutboxDoc): OutboxItemView {
  return {
    id: id(o._id),
    type: o.type,
    channel: o.channel,
    to: maskDestination(o.to),
    menteeId: o.menteeId ? id(o.menteeId) : null,
    appointmentId: o.appointmentId ? id(o.appointmentId) : null,
    status: o.status,
    attempts: o.attempts,
    nextAttemptAt: o.status === 'pending' ? iso(o.nextAttemptAt) : null,
    lastError: o.lastError,
    createdAt: iso(o.createdAt),
  };
}
