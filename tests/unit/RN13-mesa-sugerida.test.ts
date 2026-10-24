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
