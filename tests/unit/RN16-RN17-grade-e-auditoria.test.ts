import { describe, expect, it } from "vitest";
import { buildAuditEntry, checkGridChange, checkSuperAdminInvariant } from "@tw/api/domain";

const grid = { date: "2026-11-14", timezone: "America/Recife", startTime: "09:00", endTime: "18:00", slotMinutes: 40, gapMinutes: 5 };

describe("RN16 mudança de grade", () => {
  it("recusa mudar duração/intervalo/horários com mentoria ativa -> GRID_LOCKED", () => {
    for (const next of [{ ...grid, slotMinutes: 30 }, { ...grid, gapMinutes: 10 }, { ...grid, startTime: "08:00" }, { ...grid, endTime: "17:00" }, { ...grid, date: "2026-11-15" }]) {
      expect(checkGridChange(grid, next, 1)).toMatchObject({ ok: false, code: "GRID_LOCKED" });
    }
  });
  it("permite sem mentorias ou sem mudança de grade", () => {
    expect(checkGridChange(grid, { ...grid, slotMinutes: 30 }, 0)).toEqual({ ok: true });
    expect(checkGridChange(grid, { ...grid }, 5)).toEqual({ ok: true });
  });
});

describe("RN17 auditoria", () => {
  it("monta registro completo com ator, antes/depois", () => {
    const at = new Date("2026-11-14T13:00:00Z");
    expect(buildAuditEntry({ at, actor: { userId: "u1", role: "admin" }, action: "appointment.cancel", entity: "appointment", entityId: "a1", before: { status: "invited" }, after: { status: "cancelled" }, ip: "1.2.3.4" })).toEqual({
      at, actorId: "u1", actorRole: "admin", action: "appointment.cancel", entity: "appointment", entityId: "a1",
      before: { status: "invited" }, after: { status: "cancelled" }, ip: "1.2.3.4",
    });
  });
  it("ator de sistema (worker) e campos opcionais viram null", () => {
    const e = buildAuditEntry({ at: new Date(), actor: { userId: null, role: "system" }, action: "appointment.expire", entity: "appointment" });
    expect(e).toMatchObject({ actorId: null, actorRole: "system", entityId: null, before: null, after: null, ip: null });
  });
});

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
