import { describe, expect, it } from "vitest";
import { type TransitionAction, isRuleError, planTransition } from "@tw/api/domain";
import type { AppointmentStatus } from "@tw/shared";
import { S, min } from "./_util.js";

const staff = { userId: "u1", role: "mentor" as const };
const mentee = { userId: null, role: "mentee" as const };
const start = S(3).startAt;

function run(action: TransitionAction, status: AppointmentStatus, now: Date, expiresAt: Date | null = min(start, -5)) {
  return planTransition({ action, appointment: { status, startAt: start, expiresAt }, now, actor: action === "expire" ? { userId: null, role: "system" } : staff });
}
const ok = (r: ReturnType<typeof run>) => {
  if (isRuleError(r)) throw new Error(`esperava plano, veio ${r.code}`);
  return r;
};
const code = (r: ReturnType<typeof run>) => (isRuleError(r) ? r.code : "OK");

const during = min(start, -60); // convite ainda válido
const afterExpiry = min(start, -4);

describe("RN09 não compareceu", () => {
  it("antes de início + 10 min -> TOO_EARLY", () => {
    expect(code(run("no_show", "confirmed", min(start, 9)))).toBe("TOO_EARLY");
    expect(code(run("no_show", "confirmed", min(start, -30)))).toBe("TOO_EARLY");
  });
  it("a partir de início + 10 min -> no_show", () => {
    const p = ok(run("no_show", "confirmed", min(start, 10)));
    expect(p).toMatchObject({ appointmentTo: "no_show", menteeTo: "no_show" });
    expect(p.locks).toEqual({ slotLock: true, menteeLock: false });
  });
  it("só de confirmed", () => {
    for (const s of ["invited", "in_progress", "done", "cancelled"] as const)
      expect(code(run("no_show", s, min(start, 30)))).toBe("INVALID_STATE");
  });
});
