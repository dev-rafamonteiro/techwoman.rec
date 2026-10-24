import { describe, expect, it } from "vitest";
import { reminderSendAt, shouldSendReminder } from "@tw/api/domain";
import { S, min, recife } from "./_util.js";

const TZ = "America/Recife";

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
