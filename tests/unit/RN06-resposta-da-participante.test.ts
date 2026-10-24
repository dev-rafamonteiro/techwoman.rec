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

describe("RN06 resposta da participante", () => {
  it("aceitar convite válido: confirmed, travas mantidas, lembrete (RN15) e aviso", () => {
    const p = ok(run("accept", "invited", during));
    expect(p).toMatchObject({ appointmentTo: "confirmed", menteeTo: "confirmed", notify: "confirmed", scheduleReminder: true });
    expect(p.locks).toEqual({ slotLock: true, menteeLock: true });
  });
  it("aceitar vencido -> INVITE_EXPIRED", () => expect(code(run("accept", "invited", afterExpiry))).toBe("INVITE_EXPIRED"));
  it("aceitar exatamente em expiresAt -> INVITE_EXPIRED (vencido = <=)", () =>
    expect(code(run("accept", "invited", min(start, -5)))).toBe("INVITE_EXPIRED"));
  it.each(["confirmed", "in_progress", "done", "declined", "expired", "cancelled", "no_show"] as const)(
    "aceitar em %s -> INVALID_STATE", (s) => expect(code(run("accept", s, during))).toBe("INVALID_STATE"));

  it("recusa 'Horário não serve': waiting + prioridade declined_schedule, libera tudo", () => {
    const p = ok(run("decline_schedule", "invited", during));
    expect(p).toMatchObject({ appointmentTo: "declined", menteeTo: "waiting", priority: { value: true, reason: "declined_schedule" } });
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("recusa 'Não tenho mais interesse': inscrição cancelled, sem prioridade", () => {
    const p = ok(run("decline_no_interest", "invited", during));
    expect(p).toMatchObject({ appointmentTo: "declined", menteeTo: "cancelled" });
    expect(p.priority).toBeUndefined();
  });
  it("recusar vencido -> INVITE_EXPIRED", () => {
    expect(code(run("decline_schedule", "invited", afterExpiry))).toBe("INVITE_EXPIRED");
    expect(code(run("decline_no_interest", "invited", afterExpiry))).toBe("INVITE_EXPIRED");
  });
  it("participante cancela invited/confirmed -> cancelled sem prioridade; outros estados INVALID_STATE", () => {
    for (const s of ["invited", "confirmed"] as const) {
      const p = ok(run("mentee_cancel", s, during));
      expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "cancelled" });
      expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
    }
    expect(code(run("mentee_cancel", "done", during))).toBe("INVALID_STATE");
  });
});

describe("mentee não aparece como actor de staff", () => {
  it("planTransition aceita actor mentee", () => {
    const r = planTransition({ action: "accept", appointment: { status: "invited", startAt: start, expiresAt: min(start, -5) }, now: during, actor: mentee });
    expect(isRuleError(r)).toBe(false);
  });
});
