import { describe, expect, it } from "vitest";
import { canUpdatePreferredPeriod, matchesPeriod, periodOfStart } from "@tw/api/domain";
import { S, min, recife } from "./_util.js";

const TZ = "America/Recife";

describe("RN14 período preferido (horário de Recife)", () => {
  it.each([
    ["09:00", "morning"], ["11:59", "morning"],
    ["12:00", "early_afternoon"], ["14:59", "early_afternoon"],
    ["15:00", "late_afternoon"], ["17:20", "late_afternoon"],
  ] as const)("%s -> %s", (hhmm, expected) => expect(periodOfStart(recife(hhmm), TZ)).toBe(expected));

  it("slots da grade padrão caem nos períodos esperados", () => {
    const periods = Array.from({ length: 9 }, (_, i) => periodOfStart(S(i + 1).startAt, TZ));
    expect(periods.filter((p) => p === "morning")).toHaveLength(3);
    expect(periods.filter((p) => p === "early_afternoon")).toHaveLength(4);
    expect(periods.filter((p) => p === "late_afternoon")).toHaveLength(2);
    expect(periods[0]).toBe("morning");
    expect(periods[8]).toBe("late_afternoon");
  });
  it("any casa com qualquer horário; específico só com o seu", () => {
    expect(matchesPeriod("any", recife("16:00"), TZ)).toBe(true);
    expect(matchesPeriod("morning", recife("16:00"), TZ)).toBe(false);
    expect(matchesPeriod("late_afternoon", recife("16:00"), TZ)).toBe(true);
  });
  it("usa o fuso do evento, não UTC (12:00Z = 09:00 em Recife)", () =>
    expect(periodOfStart(new Date("2026-11-14T12:00:00Z"), TZ)).toBe("morning"));
});

describe("RN14 (final) período preferido só editável em waiting", () => {
  it("waiting sim; demais não", () => {
    expect(canUpdatePreferredPeriod("waiting")).toBe(true);
    for (const s of ["invited", "confirmed", "done", "no_show", "cancelled"] as const)
      expect(canUpdatePreferredPeriod(s)).toBe(false);
  });
});
