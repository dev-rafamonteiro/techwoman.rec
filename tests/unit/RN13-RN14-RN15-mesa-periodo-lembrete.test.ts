import { describe, expect, it } from "vitest";
import { matchesPeriod, periodOfStart, reminderSendAt, shouldSendReminder, suggestTable } from "@tw/api/domain";
import { S, min, recife } from "./_util.js";

const TZ = "America/Recife";

describe("RN13 mesa sugerida", () => {
  const tables = (...nums: number[]) => nums.map((n) => ({ id: `t${n}`, number: n }));
  it("sem mentoria anterior: mesa livre de menor número", () =>
    expect(suggestTable({ chosenStartAt: S(5).startAt, mentorAppointments: [], freeTables: tables(7, 3, 9) })).toEqual({ suggestedTableId: "t3", previousTableId: null }));
  it("sugere a mesa da mentoria anterior mais próxima, se livre", () =>
    expect(
      suggestTable({
        chosenStartAt: S(5).startAt,
        mentorAppointments: [{ tableId: "t9", startAt: S(1).startAt }, { tableId: "t7", startAt: S(3).startAt }],
        freeTables: tables(1, 7, 9),
      }),
    ).toEqual({ suggestedTableId: "t7", previousTableId: "t7" }));
  it("anterior ocupada: menor número livre", () =>
    expect(suggestTable({ chosenStartAt: S(5).startAt, mentorAppointments: [{ tableId: "t7", startAt: S(3).startAt }], freeTables: tables(4, 2) })).toEqual({ suggestedTableId: "t2", previousTableId: "t7" }));
  it("ignora mentorias posteriores ao horário escolhido", () =>
    expect(suggestTable({ chosenStartAt: S(2).startAt, mentorAppointments: [{ tableId: "t7", startAt: S(6).startAt }], freeTables: tables(7, 1) })).toEqual({ suggestedTableId: "t1", previousTableId: null }));
  it("sem mesa livre: null", () =>
    expect(suggestTable({ chosenStartAt: S(2).startAt, mentorAppointments: [], freeTables: [] }).suggestedTableId).toBeNull());
});

describe("RN14 período preferido (horário de Recife)", () => {
  it.each([
    ["09:00", "morning"], ["11:59", "morning"],
    ["12:00", "early_afternoon"], ["14:59", "early_afternoon"],
    ["15:00", "late_afternoon"], ["17:20", "late_afternoon"],
  ] as const)("%s -> %s", (hhmm, expected) => expect(periodOfStart(recife(hhmm), TZ)).toBe(expected));

  it("slots da grade padrão caem nos períodos esperados", () => {
    const periods = Array.from({ length: 12 }, (_, i) => periodOfStart(S(i + 1).startAt, TZ));
    for (const k of ["morning", "early_afternoon", "late_afternoon"]) expect(periods.filter((p) => p === k)).toHaveLength(4);
    expect(periods[0]).toBe("morning");
    expect(periods[11]).toBe("late_afternoon");
  });
  it("any casa com qualquer horário; específico só com o seu", () => {
    expect(matchesPeriod("any", recife("16:00"), TZ)).toBe(true);
    expect(matchesPeriod("morning", recife("16:00"), TZ)).toBe(false);
    expect(matchesPeriod("late_afternoon", recife("16:00"), TZ)).toBe(true);
  });
  it("usa o fuso do evento, não UTC (12:00Z = 09:00 em Recife)", () =>
    expect(periodOfStart(new Date("2026-11-14T12:00:00Z"), TZ)).toBe("morning"));
});

describe("RN15 lembrete", () => {
  it("15 min antes do horário", () => expect(reminderSendAt(S(5).startAt, min(S(5).startAt, -120))).toEqual(min(S(5).startAt, -15)));
  it("se já passou do ponto, sai agora", () => {
    const now = min(S(5).startAt, -3);
    expect(reminderSendAt(S(5).startAt, now)).toEqual(now);
  });
  it("só envia se a mentoria ainda está confirmed", () => {
    expect(shouldSendReminder("confirmed")).toBe(true);
    for (const s of ["invited", "cancelled", "in_progress", "done", "no_show", "expired", null]) expect(shouldSendReminder(s)).toBe(false);
  });
});
