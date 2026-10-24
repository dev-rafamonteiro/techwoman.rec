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

describe("RN08 confirmação presencial", () => {
  it("invited -> confirmed com lembrete", () => {
    const p = ok(run("confirm_in_person", "invited", during));
    expect(p).toMatchObject({ appointmentTo: "confirmed", scheduleReminder: true, notify: "confirmed", reason: "in_person" });
  });
  it("só invited", () => expect(code(run("confirm_in_person", "confirmed", during))).toBe("INVALID_STATE"));
  it("convite vencido não pode ser confirmado", () => expect(code(run("confirm_in_person", "invited", afterExpiry))).toBe("INVITE_EXPIRED"));
});
