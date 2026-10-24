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

describe("E39 mover (move_cancel)", () => {
  it("confirmed vira cancelled sem prioridade, aviso 'moved', participante segue confirmed", () => {
    const p = ok(run("move_cancel", "confirmed", during));
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "confirmed", notify: "moved", reason: "moved" });
    expect(p.priority).toBeUndefined();
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("só confirmed", () => expect(code(run("move_cancel", "invited", during))).toBe("INVALID_STATE"));
});
