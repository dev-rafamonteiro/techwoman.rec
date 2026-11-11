/**
 * Mentoras livres para o admin agendar (A4) ou trocar/puxar da fila no mapa (A5). Livre num horário = o horário está
 * na disponibilidade dela e ela não tem mentoria ativa nele. Sem o E38 e o E31 aqui: recebe os dados prontos.
 */
const ACTIVE = new Set(['invited', 'confirmed', 'in_progress']);

interface MentorLike { id: string; name: string; areas: readonly string[]; availability: readonly string[] }
interface ApptLike { status: string; slotId: string; mentor: { id: string }; table: { id: string } }
interface SlotLike { id: string; endAt: string }
interface TableLike { id: string; active: boolean }

const busyKey = (mentorId: string, slotId: string) => `${mentorId}:${slotId}`;

/** Livres no horário `slotId` (menos `exceptId`, a mentora atual numa troca). */
export function mentorsFreeAt<M extends MentorLike>(mentors: readonly M[], appts: readonly ApptLike[], slotId: string, exceptId?: string): M[] {
  const busy = new Set(appts.filter((a) => ACTIVE.has(a.status) && a.slotId === slotId).map((a) => a.mentor.id));
  return mentors.filter((m) => m.id !== exceptId && m.availability.includes(slotId) && !busy.has(m.id));
}

/** Regra do time: só as da trilha da participante; sem nenhuma da trilha, todas as livres (`otherTracks`). */
export function trackFirst<M extends MentorLike>(mentors: readonly M[], area: string): { mentors: M[]; otherTracks: boolean } {
  const own = mentors.filter((m) => m.areas.includes(area));
  return own.length > 0 ? { mentors: own, otherTracks: false } : { mentors: [...mentors], otherTracks: true };
}

/** A4: mentoras com pelo menos um horário livre que ainda não terminou e tem mesa livre; `slots` = esses horários. */
export function mentorsWithFreeSlot<M extends MentorLike>(
  mentors: readonly M[],
  sched: { slots: readonly SlotLike[]; tables: readonly TableLike[]; appointments: readonly ApptLike[] },
  now: number,
): { mentor: M; slots: string[] }[] {
  const active = sched.appointments.filter((a) => ACTIVE.has(a.status));
  const busy = new Set(active.map((a) => busyKey(a.mentor.id, a.slotId)));
  const tables = sched.tables.filter((t) => t.active).length;
  const usedTables = new Map<string, number>();
  for (const a of active) usedTables.set(a.slotId, (usedTables.get(a.slotId) ?? 0) + 1);
  const open = sched.slots.filter((s) => new Date(s.endAt).getTime() > now && (usedTables.get(s.id) ?? 0) < tables).map((s) => s.id);
  return mentors
    .map((mentor) => ({ mentor, slots: open.filter((id) => mentor.availability.includes(id) && !busy.has(busyKey(mentor.id, id))) }))
    .filter((x) => x.slots.length > 0);
}
