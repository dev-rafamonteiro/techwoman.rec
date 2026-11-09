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

describe("iniciar e concluir (M6)", () => {
  it("start: confirmed -> in_progress, participante segue confirmed", () => {
    const p = ok(run("start", "confirmed", start));
    expect(p).toMatchObject({ appointmentTo: "in_progress", menteeTo: "confirmed" });
    expect(p.locks).toEqual({ slotLock: true, menteeLock: true });
  });
  it("finish: de confirmed (start é opcional) ou in_progress -> done; mesa continua travada, participante destravada", () => {
    for (const s of ["confirmed", "in_progress"] as const) {
      const p = ok(run("finish", s, start));
      expect(p).toMatchObject({ appointmentTo: "done", menteeTo: "done" });
      expect(p.locks).toEqual({ slotLock: true, menteeLock: false });
    }
    expect(code(run("finish", "invited", start))).toBe("INVALID_STATE");
  });
});

describe("RN23 · correção de mentoria concluída", () => {
  const sup = { userId: "u9", role: "super_admin" as const };
  const fix = (action: TransitionAction, status: AppointmentStatus) => planTransition({ action, appointment: { status, startAt: start, expiresAt: null }, now: start, actor: sup });

  it("reopen: done -> confirmed, com as duas travas e sem aviso", () => {
    const p = ok(fix("reopen", "done"));
    expect(p).toMatchObject({ appointmentTo: "confirmed", menteeTo: "confirmed", notify: null, scheduleReminder: false, locks: { slotLock: true, menteeLock: true } });
  });
  it("release: done -> cancelled, mesa livre, participante na fila com prioridade e sem aviso", () => {
    const p = ok(fix("release", "done"));
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "waiting", notify: null, priority: { value: true, reason: "cancelled_by_staff" }, locks: { slotLock: false, menteeLock: false } });
  });
  it("só de done", () => {
    for (const s of ["invited", "confirmed", "in_progress", "no_show", "cancelled", "expired", "declined"] as AppointmentStatus[]) {
      expect(code(fix("reopen", s)), s).toBe("INVALID_STATE");
      expect(code(fix("release", s)), s).toBe("INVALID_STATE");
    }
  });
});
