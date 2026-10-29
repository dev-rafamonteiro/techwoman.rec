/** Fixtures da grade padrão de mentoria: 10h-16h45, 9 slots de 45 min, fuso America/Recife. */
export const EVENT_ID = "techwoman-2026";
export const EVENT_DATE = "2026-11-14";
const RECIFE_OFFSET_H = 3;

export interface SlotFixture {
  id: string;
  startAt: Date;
  endAt: Date;
}

export function buildSlots(
  date = EVENT_DATE,
  start = "10:00",
  end = "16:45",
  slotMinutes = 45,
  gapMinutes = 0,
): SlotFixture[] {
  const [sh, sm] = start.split(":").map(Number) as [number, number];
  const [eh, em] = end.split(":").map(Number) as [number, number];
  const base = Date.parse(`${date}T00:00:00Z`) + RECIFE_OFFSET_H * 3600_000;
  const endMs = base + (eh * 60 + em) * 60_000;
  const slots: SlotFixture[] = [];
  for (let t = base + (sh * 60 + sm) * 60_000, i = 1; t + slotMinutes * 60_000 <= endMs; t += (slotMinutes + gapMinutes) * 60_000, i++) {
    slots.push({
      id: `s${String(i).padStart(2, "0")}`,
      startAt: new Date(t),
      endAt: new Date(t + slotMinutes * 60_000),
    });
  }
  return slots;
}

export function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    _id: EVENT_ID,
    name: "Tech Woman",
    date: EVENT_DATE,
    timezone: "America/Recife",
    startTime: "10:00",
    endTime: "16:45",
    slotMinutes: 45,
    gapMinutes: 0,
    slots: buildSlots(),
    responseWindowMinutes: 15,
    minLeadMinutes: 10,
    registrationOpen: true,
    areas: [
      { key: "dados", label: "Dados" },
      { key: "dev", label: "Desenvolvimento" },
      { key: "ux", label: "UX" },
    ],
    templates: { invite: "{mentora} quer te mentorar às {horario}." },
    version: 1,
    ...overrides,
  };
}

export function buildTables(count = 20, eventId = EVENT_ID) {
  return Array.from({ length: count }, (_, i) => ({
    eventId,
    number: i + 1,
    label: `Mesa ${i + 1}`,
    active: true,
  }));
}
