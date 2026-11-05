import { describe, expect, it } from "vitest";
import { canSelfBook, chooseMentorForSelfBook, isRuleError, planTransition } from "@tw/api/domain";
import type { AppointmentStatus } from "@tw/shared";
import { S, min } from "./_util.js";

/** RN19 · trocar de horário (E04 `reschedule`) e escolher sozinha um novo (E07, E08). */

describe("RN19 transição mentee_reschedule", () => {
  const start = S(3).startAt;
  const mentee = { userId: null, role: "mentee" as const };
  const run = (status: AppointmentStatus, now: Date) => planTransition({ action: "mentee_reschedule", appointment: { status, startAt: start, expiresAt: null }, now, actor: mentee });
  it("confirmed antes do início -> cancelled; participante waiting com prioridade declined_schedule; libera travas; aviso slot_released", () => {
    const p = run("confirmed", min(start, -30));
    if (isRuleError(p)) throw new Error(p.code);
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "waiting", priority: { value: true, reason: "declined_schedule" }, notify: "slot_released", scheduleReminder: false });
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("no horário ou depois -> INVALID_STATE", () => {
    for (const now of [start, min(start, 1)]) {
      const p = run("confirmed", now);
      expect(isRuleError(p) ? p.code : "OK").toBe("INVALID_STATE");
    }
  });
  it.each(["invited", "in_progress", "done", "no_show", "declined", "expired", "cancelled"] as const)("%s -> INVALID_STATE", (s) => {
    const p = run(s, min(start, -30));
    expect(isRuleError(p) ? p.code : "OK").toBe("INVALID_STATE");
  });
});

describe("RN19 escolha sozinha (canSelfBook, chooseMentorForSelfBook)", () => {
  it("só waiting com lastOutcome declined_schedule", () => {
    expect(canSelfBook({ status: "waiting", lastOutcome: "declined_schedule" })).toBe(true);
    expect(canSelfBook({ status: "waiting", lastOutcome: null })).toBe(false);
    expect(canSelfBook({ status: "waiting", lastOutcome: "cancelled_by_staff" })).toBe(false);
    expect(canSelfBook({ status: "waiting", lastOutcome: "expired" })).toBe(false);
    for (const s of ["invited", "confirmed", "done", "cancelled", "no_show"] as const) expect(canSelfBook({ status: s, lastOutcome: "declined_schedule" })).toBe(false);
  });
  it("menos mentorias ativas; empate por nome (pt-BR) e depois id", () => {
    expect(chooseMentorForSelfBook([])).toBeNull();
    expect(chooseMentorForSelfBook([{ id: "a", name: "Ana", activeCount: 2 }, { id: "b", name: "Zuleica", activeCount: 1 }])!.id).toBe("b");
    expect(chooseMentorForSelfBook([{ id: "b", name: "Érica", activeCount: 1 }, { id: "a", name: "Fernanda", activeCount: 1 }, { id: "c", name: "Bruna", activeCount: 3 }])!.id).toBe("b");
    expect(chooseMentorForSelfBook([{ id: "y", name: "Ana", activeCount: 0 }, { id: "x", name: "Ana", activeCount: 0 }])!.id).toBe("x");
  });
});
