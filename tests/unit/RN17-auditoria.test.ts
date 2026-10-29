import { describe, expect, it } from "vitest";
import { buildAuditEntry } from "@tw/api/domain";

const grid = { date: "2026-11-14", timezone: "America/Recife", startTime: "10:00", endTime: "16:45", slotMinutes: 45, gapMinutes: 0 };

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
