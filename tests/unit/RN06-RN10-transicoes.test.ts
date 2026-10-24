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

describe("RN08 confirmação presencial", () => {
  it("invited -> confirmed com lembrete", () => {
    const p = ok(run("confirm_in_person", "invited", during));
    expect(p).toMatchObject({ appointmentTo: "confirmed", scheduleReminder: true, notify: "confirmed", reason: "in_person" });
  });
  it("só invited", () => expect(code(run("confirm_in_person", "confirmed", during))).toBe("INVALID_STATE"));
  it("convite vencido não pode ser confirmado", () => expect(code(run("confirm_in_person", "invited", afterExpiry))).toBe("INVITE_EXPIRED"));
});

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

describe("RN10 cancelamento pela mentora/admin", () => {
  it.each(["invited", "confirmed"] as const)("%s -> cancelled; participante waiting com prioridade cancelled_by_staff; libera mesa e horário", (s) => {
    const p = ok(run("staff_cancel", s, during));
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "waiting", priority: { value: true, reason: "cancelled_by_staff" }, notify: "cancelled" });
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it.each(["in_progress", "done", "no_show", "declined", "expired", "cancelled"] as const)("%s -> INVALID_STATE", (s) =>
    expect(code(run("staff_cancel", s, during))).toBe("INVALID_STATE"));
});

describe("E39 mover (move_cancel)", () => {
  it("confirmed vira cancelled sem prioridade, aviso 'moved', participante segue confirmed", () => {
    const p = ok(run("move_cancel", "confirmed", during));
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "confirmed", notify: "moved", reason: "moved" });
    expect(p.priority).toBeUndefined();
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("só confirmed", () => expect(code(run("move_cancel", "invited", during))).toBe("INVALID_STATE"));
});

describe("mentee não aparece como actor de staff", () => {
  it("planTransition aceita actor mentee", () => {
    const r = planTransition({ action: "accept", appointment: { status: "invited", startAt: start, expiresAt: min(start, -5) }, now: during, actor: mentee });
    expect(isRuleError(r)).toBe(false);
  });
});
