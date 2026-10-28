import { describe, expect, it } from "vitest";
import { checkSuperAdminInvariant } from "@tw/api/domain";

const grid = { date: "2026-11-14", timezone: "America/Recife", startTime: "10:00", endTime: "16:45", slotMinutes: 45, gapMinutes: 0 };

describe("invariante: ao menos um super admin ativo", () => {
  const users = [
    { id: "s1", roles: ["super_admin"] as const, status: "active" as const },
    { id: "a1", roles: ["admin"] as const, status: "active" as const },
  ];
  it("recusa desativar o único super admin", () =>
    expect(checkSuperAdminInvariant(users, { userId: "s1", status: "disabled" })).toMatchObject({ ok: false, code: "LAST_SUPER_ADMIN" }));
  it("recusa remover o papel do único super admin", () =>
    expect(checkSuperAdminInvariant(users, { userId: "s1", roles: ["admin"] })).toMatchObject({ ok: false, code: "LAST_SUPER_ADMIN" }));
  it("permite com outro super admin ativo", () =>
    expect(checkSuperAdminInvariant([...users, { id: "s2", roles: ["super_admin"], status: "active" }], { userId: "s1", status: "disabled" })).toEqual({ ok: true }));
  it("outro super admin desativado não conta", () =>
    expect(checkSuperAdminInvariant([...users, { id: "s2", roles: ["super_admin"], status: "disabled" }], { userId: "s1", status: "disabled" })).toMatchObject({ ok: false }));
});
