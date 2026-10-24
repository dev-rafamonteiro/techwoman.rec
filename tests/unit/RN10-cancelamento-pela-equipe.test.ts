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

describe("RN10 cancelamento pela mentora/admin", () => {
  it.each(["invited", "confirmed"] as const)("%s -> cancelled; participante waiting com prioridade cancelled_by_staff; libera mesa e horário", (s) => {
    const p = ok(run("staff_cancel", s, during));
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "waiting", priority: { value: true, reason: "cancelled_by_staff" }, notify: "cancelled" });
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it.each(["in_progress", "done", "no_show", "declined", "expired", "cancelled"] as const)("%s -> INVALID_STATE", (s) =>
    expect(code(run("staff_cancel", s, during))).toBe("INVALID_STATE"));
});
