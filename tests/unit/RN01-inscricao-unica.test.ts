import { describe, expect, it } from "vitest";
import { normalizeEmail, registrationOutcome } from "@tw/api/domain";
import { S, min } from "./_util.js";

describe("RN01 inscrição única por e-mail ou celular", () => {
  it("sem inscrição cria", () => expect(registrationOutcome(null)).toBe("create"));
  it.each(["waiting", "invited", "confirmed", "done"] as const)("inscrição ativa (%s) bloqueia", (status) =>
    expect(registrationOutcome({ status })).toBe("blocked"));
  it("celular de inscrição ativa (outro e-mail) bloqueia", () =>
    expect(registrationOutcome(null, [{ status: "confirmed" }])).toBe("blocked"));
  it("celular só de inscrição cancelada não bloqueia", () =>
    expect(registrationOutcome(null, [{ status: "cancelled" }])).toBe("create"));
  it("e-mail cancelado + celular de outra inscrição ativa bloqueia", () =>
    expect(registrationOutcome({ status: "cancelled" }, [{ status: "cancelled" }, { status: "waiting" }])).toBe("blocked"));
  it.each(["cancelled", "no_show"] as const)("%s reativa", (status) =>
    expect(registrationOutcome({ status })).toBe("reactivate"));
  it("normaliza e-mail (minúsculo, sem espaços)", () => {
    expect(normalizeEmail("  Maria.Silva@Exemplo.COM ")).toBe("maria.silva@exemplo.com");
  });
});
