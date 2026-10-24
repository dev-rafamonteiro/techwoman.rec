import { describe, expect, it } from "vitest";
import { blockedAvailabilityRemovals, checkAvailabilityUpdate, mentorDisableBlockers } from "@tw/api/domain";
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

describe("RN12 desativar mentora", () => {
  const now = min(S(3).startAt, -30);
  const ref = (id: string, status: any, slot: number) => ({ id, status, startAt: S(slot).startAt, endAt: S(slot).endAt });
  it("lista só mentorias ativas que ainda não terminaram", () => {
    const out = mentorDisableBlockers(
      [ref("a", "invited", 3), ref("b", "confirmed", 6), ref("c", "in_progress", 3), ref("d", "done", 4), ref("e", "cancelled", 5), ref("f", "confirmed", 1)],
      now,
    );
    expect(out.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("vazio libera a desativação", () => expect(mentorDisableBlockers([], now)).toEqual([]));
});
