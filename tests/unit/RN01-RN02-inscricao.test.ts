import { describe, expect, it } from "vitest";
import { canUpdatePreferredPeriod, isRegistrationOpen, normalizeEmail, registrationOutcome } from "@tw/api/domain";
import { S, min } from "./_util.js";

describe("RN01 inscrição única por e-mail", () => {
  it("sem inscrição cria", () => expect(registrationOutcome(null)).toBe("create"));
  it.each(["waiting", "invited", "confirmed", "done"] as const)("inscrição ativa (%s) reenvia o link", (status) =>
    expect(registrationOutcome({ status })).toBe("resend_link"));
  it.each(["cancelled", "no_show"] as const)("%s reativa", (status) =>
    expect(registrationOutcome({ status })).toBe("reactivate"));
  it("normaliza e-mail (minúsculo, sem espaços)", () => {
    expect(normalizeEmail("  Maria.Silva@Exemplo.COM ")).toBe("maria.silva@exemplo.com");
  });
});

describe("RN02 janela de inscrição", () => {
  const last = S(12).startAt;
  it("aberta antes do início do último horário", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, min(last, -1))).toBe(true));
  it("fechada no instante exato do início do último horário", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, last)).toBe(false));
  it("fechada depois", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, min(last, 60))).toBe(false));
  it("fechada se registrationOpen=false", () =>
    expect(isRegistrationOpen({ registrationOpen: false, lastSlotStartAt: last }, min(last, -600))).toBe(false));
  it("fechada sem grade", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: null }, new Date())).toBe(false));
});

describe("RN14 (final) período preferido só editável em waiting", () => {
  it("waiting sim; demais não", () => {
    expect(canUpdatePreferredPeriod("waiting")).toBe(true);
    for (const s of ["invited", "confirmed", "done", "no_show", "cancelled"] as const)
      expect(canUpdatePreferredPeriod(s)).toBe(false);
  });
});
