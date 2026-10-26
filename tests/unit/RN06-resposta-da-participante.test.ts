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
  it("aviso registration_cancelled: participante cancelando ou recusando sem interesse; admin cancelando (E36) não", () => {
    const asMentee = (action: TransitionAction, status: AppointmentStatus) =>
      ok(planTransition({ action, appointment: { status, startAt: start, expiresAt: min(start, -5) }, now: during, actor: mentee }));
    expect(asMentee("mentee_cancel", "invited").notify).toBe("registration_cancelled");
    expect(asMentee("mentee_cancel", "confirmed").notify).toBe("registration_cancelled");
    expect(asMentee("decline_no_interest", "invited").notify).toBe("registration_cancelled");
    expect(asMentee("mentee_reschedule", "confirmed").notify).toBe("slot_released");
    const admin = ok(planTransition({ action: "mentee_cancel", appointment: { status: "confirmed", startAt: start, expiresAt: null }, now: during, actor: { userId: "a1", role: "admin" } }));
    expect(admin.notify).toBeNull();
    const adminDecline = ok(planTransition({ action: "decline_no_interest", appointment: { status: "invited", startAt: start, expiresAt: min(start, -5) }, now: during, actor: { userId: "a1", role: "admin" } }));
    expect(adminDecline.notify).toBeNull();
  });
});

describe("aviso slot_released (horário liberado pela participante)", () => {
  it("recusa 'Horário não serve' e troca de horário pela participante; outro actor não", () => {
    const run2 = (action: TransitionAction, status: AppointmentStatus, actor: Parameters<typeof planTransition>[0]["actor"]) =>
      ok(planTransition({ action, appointment: { status, startAt: start, expiresAt: min(start, -5) }, now: during, actor }));
    expect(run2("decline_schedule", "invited", mentee).notify).toBe("slot_released");
    expect(run2("mentee_reschedule", "confirmed", mentee).notify).toBe("slot_released");
    const admin = { userId: "a1", role: "admin" as const };
    expect(run2("decline_schedule", "invited", admin).notify).toBeNull();
    expect(run2("mentee_reschedule", "confirmed", admin).notify).toBeNull();
    // cancelamento pela mentora/admin continua com o próprio aviso
    expect(run2("staff_cancel", "confirmed", admin).notify).toBe("cancelled");
  });
});

describe("mentee não aparece como actor de staff", () => {
  it("planTransition aceita actor mentee", () => {
    const r = planTransition({ action: "accept", appointment: { status: "invited", startAt: start, expiresAt: min(start, -5) }, now: during, actor: mentee });
    expect(isRuleError(r)).toBe(false);
  });
});

describe("aviso à mentora mentor_slot_released (PLAN, Notificações > Aviso à mentora)", () => {
  const run3 = (action: TransitionAction, status: AppointmentStatus, actor: Parameters<typeof planTransition>[0]["actor"]) =>
    ok(planTransition({ action, appointment: { status, startAt: start, expiresAt: min(start, -5) }, now: during, actor }));
  it("participante: confirmada cancelada, convite recusado (qualquer motivo) ou inscrição cancelada com convite pendente", () => {
    expect(run3("mentee_cancel", "confirmed", mentee).notifyMentor).toBe("confirmed_cancelled");
    expect(run3("mentee_reschedule", "confirmed", mentee).notifyMentor).toBe("confirmed_cancelled");
    expect(run3("decline_schedule", "invited", mentee).notifyMentor).toBe("invite_declined");
    expect(run3("decline_no_interest", "invited", mentee).notifyMentor).toBe("invite_declined");
    expect(run3("mentee_cancel", "invited", mentee).notifyMentor).toBe("invite_cancelled");
  });
  it("mentora, admin e expiração não avisam a mentora; aceitar também não", () => {
    const admin = { userId: "a1", role: "admin" as const };
    expect(run3("mentee_cancel", "confirmed", admin).notifyMentor).toBeNull();
    expect(run3("mentee_reschedule", "confirmed", admin).notifyMentor).toBeNull();
    expect(run3("staff_cancel", "confirmed", staff).notifyMentor).toBeNull();
    expect(run3("staff_cancel", "invited", admin).notifyMentor).toBeNull();
    expect(run3("accept", "invited", mentee).notifyMentor).toBeNull();
    expect(ok(run("expire", "invited", afterExpiry)).notifyMentor).toBeNull();
  });
});
