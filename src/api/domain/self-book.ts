import type { MenteeStatus, PreferredPeriod } from '@tw/shared';
import { matchesPeriod } from './period.js';

/** RN19 · Pode escolher sozinha um horário pelo link pessoal: `waiting` com `lastOutcome = "declined_schedule"`. */
export function canSelfBook(mentee: { status: MenteeStatus; lastOutcome: string | null }): boolean {
  return mentee.status === 'waiting' && mentee.lastOutcome === 'declined_schedule';
}

export interface SelfBookMentorCandidate {
  id: string;
  name: string;
  /** Mentorias ativas (invited/confirmed/in_progress) dela no evento. */
  activeCount: number;
}

/** RN19 · E08 escolhe a mentora com menos mentorias ativas no evento; empate: nome (depois id, para ser estável). */
export function chooseMentorForSelfBook<T extends SelfBookMentorCandidate>(candidates: readonly T[]): T | null {
  const sorted = [...candidates].sort(
    (a, b) => a.activeCount - b.activeCount || a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return sorted[0] ?? null;
}

export interface SelfBookSlotsInput {
  now: Date;
  minLeadMinutes: number;
  timezone: string;
  preferredPeriod: PreferredPeriod;
  slots: readonly { id: string; startAt: Date; endAt: Date }[];
  /** Mentoras ativas da área dela, com a disponibilidade. */
  mentors: readonly { id: string; availability: readonly string[] }[];
  /** Mentorias ativas do evento (ocupam mentora e mesa no horário). */
  activeAppointments: readonly { slotId: string; mentorId: string; tableId: string }[];
  activeTableIds: readonly string[];
}

/**
 * RN19 · E07: horários futuros (respeitando `minLeadMinutes`) com ao menos uma mentora livre (horário na
 * disponibilidade e sem mentoria ativa nele) e uma mesa ativa livre. `matchesPeriod` marca o período preferido (RN14).
 */
export function selfBookSlots(i: SelfBookSlotsInput): { slotId: string; startAt: Date; endAt: Date; matchesPeriod: boolean }[] {
  const earliest = i.now.getTime() + i.minLeadMinutes * 60_000;
  return [...i.slots]
    .filter((s) => s.startAt.getTime() >= earliest)
    .filter((s) => {
      const here = i.activeAppointments.filter((a) => a.slotId === s.id);
      const busyMentors = new Set(here.map((a) => a.mentorId));
      const busyTables = new Set(here.map((a) => a.tableId));
      return i.mentors.some((m) => m.availability.includes(s.id) && !busyMentors.has(m.id)) && i.activeTableIds.some((t) => !busyTables.has(t));
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((s) => ({ slotId: s.id, startAt: s.startAt, endAt: s.endAt, matchesPeriod: matchesPeriod(i.preferredPeriod, s.startAt, i.timezone) }));
}
