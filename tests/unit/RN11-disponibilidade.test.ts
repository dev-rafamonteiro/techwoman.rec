import { describe, expect, it } from "vitest";
import { blockedAvailabilityRemovals, checkAvailabilityUpdate } from "@tw/api/domain";
import { S, min } from "./_util.js";

const all = ["s01", "s02", "s03", "s04"];

describe("RN11 disponibilidade", () => {
  it("bloqueia remover horário com mentoria invited/confirmed/in_progress", () => {
    for (const status of ["invited", "confirmed", "in_progress"] as const) {
      expect(blockedAvailabilityRemovals({ current: all, next: ["s01", "s03", "s04"], appointments: [{ slotId: "s02", status }] })).toEqual(["s02"]);
    }
  });
  it("libera remover horário cuja mentoria está encerrada/liberada", () => {
    for (const status of ["done", "no_show", "declined", "expired", "cancelled"] as const) {
      expect(blockedAvailabilityRemovals({ current: all, next: ["s01"], appointments: [{ slotId: "s02", status }] })).toEqual([]);
    }
  });
  it("adicionar nunca bloqueia; manter horário com mentoria é ok", () => {
    expect(blockedAvailabilityRemovals({ current: ["s01"], next: all, appointments: [{ slotId: "s01", status: "invited" }] })).toEqual([]);
  });
  it("checkAvailabilityUpdate: SLOT_IN_USE com a lista; VALIDATION_ERROR para slot inexistente; ok", () => {
    const base = { current: all, validSlotIds: all, appointments: [{ slotId: "s02", status: "confirmed" as const }] };
    expect(checkAvailabilityUpdate({ ...base, next: ["s01"] })).toMatchObject({ ok: false, code: "SLOT_IN_USE", details: { slotIds: ["s02"] } });
    expect(checkAvailabilityUpdate({ ...base, next: ["s02", "s99"] })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(checkAvailabilityUpdate({ ...base, next: ["s02"] })).toEqual({ ok: true });
  });
});
