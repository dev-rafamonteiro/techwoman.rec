import { describe, expect, it } from "vitest";
import { checkGridChange } from "@tw/api/domain";

const grid = { date: "2026-11-14", timezone: "America/Recife", startTime: "09:00", endTime: "18:00", slotMinutes: 40, gapMinutes: 5 };

describe("RN16 mudança de grade", () => {
  it("recusa mudar duração/intervalo/horários com mentoria ativa -> GRID_LOCKED", () => {
    for (const next of [{ ...grid, slotMinutes: 30 }, { ...grid, gapMinutes: 10 }, { ...grid, startTime: "08:00" }, { ...grid, endTime: "17:00" }, { ...grid, date: "2026-11-15" }]) {
      expect(checkGridChange(grid, next, 1)).toMatchObject({ ok: false, code: "GRID_LOCKED" });
    }
  });
  it("permite sem mentorias ou sem mudança de grade", () => {
    expect(checkGridChange(grid, { ...grid, slotMinutes: 30 }, 0)).toEqual({ ok: true });
    expect(checkGridChange(grid, { ...grid }, 5)).toEqual({ ok: true });
  });
});
