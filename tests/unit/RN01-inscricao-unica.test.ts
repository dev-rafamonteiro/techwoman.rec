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
