import { buildSlots } from "../fixtures/event.js";

export const SLOTS = buildSlots();
export const S = (n: number) => SLOTS[n - 1]!;
export const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
/** Instante em Recife (UTC-3) no dia do evento. */
export const recife = (hhmm: string, date = "2026-11-14") => new Date(`${date}T${hhmm}:00-03:00`);
