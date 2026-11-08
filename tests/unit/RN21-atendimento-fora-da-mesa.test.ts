import { describe, expect, it } from "vitest";
import { E51BodySchema } from "@tw/shared";
import { planTransition, shouldDeregisterOnWalkInRemoval, walkInEffect, walkInSituation } from "@tw/api/domain";

describe("RN21 · atendimento fora da mesa: ela sempre termina atendida e fora da fila", () => {
  it.each(["waiting", "no_show"] as const)("%s vira concluída", (status) => {
    expect(walkInEffect(status)).toEqual({ ok: true, next: "done", changes: true, cancelsAppointment: false });
  });
  it.each(["invited", "confirmed"] as const)("%s: a mentoria da mesa é cancelada e ela vira concluída", (status) => {
    expect(walkInEffect(status)).toEqual({ ok: true, next: "done", changes: true, cancelsAppointment: true });
  });
  it("já concluída fica como está", () => expect(walkInEffect("done")).toEqual({ ok: true, next: "done", changes: false, cancelsAppointment: false }));
  it("cancelada não pode ser escolhida", () => expect(walkInEffect("cancelled")).toEqual({ ok: false }));
});

describe("RN21 · walk_in_cancel na máquina de estados", () => {
  const now = new Date("2026-11-14T13:00:00Z");
  const actor = { userId: "507f1f77bcf86cd799439011", role: "mentor" as const };
  it.each(["invited", "confirmed", "in_progress"] as const)("%s -> cancelada, travas liberadas, participante done, sem aviso a ela e com aviso à mentora", (status) => {
    const p = planTransition({ action: "walk_in_cancel", appointment: { status, startAt: new Date("2026-11-14T14:00:00Z"), expiresAt: new Date("2026-11-14T12:00:00Z") }, now, actor });
    expect(p).toMatchObject({ ok: true, appointmentTo: "cancelled", menteeTo: "done", locks: { slotLock: false, menteeLock: false }, notify: null, notifyMentor: "walked_in_elsewhere" });
  });
  it.each(["done", "no_show", "cancelled", "declined", "expired"] as const)("%s não pode", (status) => {
    const p = planTransition({ action: "walk_in_cancel", appointment: { status, startAt: now, expiresAt: null }, now, actor });
    expect(p).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });
});

describe("RN21 · remoção pelo admin (E53): descadastra quem foi atendida só por este atendimento", () => {
  const base = { currentStatus: "done" as const, otherActiveWalkIns: 0, tableAppointments: 0 };
  it("concluída, sem outro atendimento nem mentoria na mesa -> descadastra", () => expect(shouldDeregisterOnWalkInRemoval(base)).toBe(true));
  it.each([
    ["outra mentora também a atendeu", { otherActiveWalkIns: 1 }],
    ["tem mentoria na mesa (ativa ou concluída)", { tableAppointments: 1 }],
    ["já está cancelada (ex.: anonimizada)", { currentStatus: "cancelled" as const }],
  ])("não descadastra: %s", (_l, over) => expect(shouldDeregisterOnWalkInRemoval({ ...base, ...over })).toBe(false));
});

describe("RN21 · situação mostrada em M7 (E50)", () => {
  it.each([
    ["waiting", false, "waiting"],
    ["invited", false, "scheduled"],
    ["confirmed", false, "scheduled"],
    ["done", false, "done"],
    ["no_show", false, "no_show"],
    ["done", true, "walked_in_by_me"],
    ["waiting", true, "walked_in_by_me"],
  ] as const)("%s (já atendida por mim: %s) -> %s", (status, walkedInByMe, expected) => {
    expect(walkInSituation({ status, walkedInByMe })).toBe(expected);
  });
});

describe("RN21 · contrato de E51", () => {
  it("aceita participante existente ou cadastro rápido com aceite", () => {
    expect(E51BodySchema.safeParse({ menteeId: "abc", note: "conversa rápida" }).success).toBe(true);
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ANA@x.com", area: "dados" }, consentAccepted: true }).success).toBe(true);
  });
  it("recusa cadastro sem aceite, nota longa ou os dois formatos juntos", () => {
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" } }).success).toBe(false);
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" }, consentAccepted: false }).success).toBe(false);
    expect(E51BodySchema.safeParse({ menteeId: "abc", note: "x".repeat(501) }).success).toBe(false);
    expect(E51BodySchema.safeParse({ menteeId: "abc", newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" }, consentAccepted: true }).success).toBe(false);
  });
});
