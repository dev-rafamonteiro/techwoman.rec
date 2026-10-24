import { describe, expect, it } from "vitest";
import { isRuleError, planTransition, type TransitionAction } from "@tw/api/domain";
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

describe("RN07 expiração (worker)", () => {
  it("vencido: expired, participante waiting SEM prioridade, aviso 'expired', libera tudo", () => {
    const p = ok(run("expire", "invited", afterExpiry));
    expect(p).toMatchObject({ appointmentTo: "expired", menteeTo: "waiting", notify: "expired" });
    expect(p.priority).toBeUndefined();
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("não expira antes do prazo", () => expect(code(run("expire", "invited", during))).toBe("INVALID_STATE"));
  it("não expira o que já foi respondido", () => {
    for (const s of ["confirmed", "declined", "cancelled", "expired"] as const)
      expect(code(run("expire", s, afterExpiry))).toBe("INVALID_STATE");
  });
});
