import { describe, expect, it } from "vitest";
import { checkInvite, computeExpiry } from "@tw/api/domain";
import { S, min } from "./_util.js";

const mentor = { status: "active" as const, availability: ["s01", "s02", "s03"] };
const table = { active: true };
const base = (over = {}) => ({
  now: min(S(1).startAt, -60),
  slot: { id: "s01", startAt: S(1).startAt },
  mentor,
  table,
  minLeadMinutes: 10,
  ...over,
});

describe("RN04 convite válido (parte estática)", () => {
  it("caminho feliz", () => expect(checkInvite(base())).toEqual({ ok: true, warnings: [] }));

  it("horário fora da grade -> SLOT_UNAVAILABLE not_in_event", () =>
    expect(checkInvite(base({ slot: null }))).toMatchObject({ ok: false, code: "SLOT_UNAVAILABLE", reason: "not_in_event" }));
  it("mentora desativada -> mentor_inactive", () =>
    expect(checkInvite(base({ mentor: { ...mentor, status: "disabled" } }))).toMatchObject({ ok: false, reason: "mentor_inactive" }));
  it("mesa inativa ou inexistente -> table_inactive", () => {
    expect(checkInvite(base({ table: { active: false } }))).toMatchObject({ ok: false, reason: "table_inactive" });
    expect(checkInvite(base({ table: null }))).toMatchObject({ ok: false, reason: "table_inactive" });
  });
  it("horário fora da disponibilidade -> not_available", () =>
    expect(checkInvite(base({ slot: { id: "s05", startAt: S(5).startAt }, now: min(S(5).startAt, -60) }))).toMatchObject({
      ok: false,
      reason: "not_available",
    }));

  describe("antecedência mínima de 10 min", () => {
    it("exatamente 10 min antes passa", () =>
      expect(checkInvite(base({ now: min(S(1).startAt, -10) })).ok).toBe(true));
    it("9 min antes falha com lead_time", () =>
      expect(checkInvite(base({ now: min(S(1).startAt, -9) }))).toMatchObject({ ok: false, reason: "lead_time" }));
    it("horário já iniciado falha", () =>
      expect(checkInvite(base({ now: min(S(1).startAt, 5) }))).toMatchObject({ ok: false, reason: "lead_time" }));
  });

  describe("override de admin (com aviso)", () => {
    it("ignora disponibilidade com aviso OUTSIDE_MENTOR_AVAILABILITY", () => {
      const r = checkInvite(
        base({ slot: { id: "s05", startAt: S(5).startAt }, now: min(S(5).startAt, -60), override: { ignoreAvailability: true } }),
      );
      expect(r).toEqual({ ok: true, warnings: ["OUTSIDE_MENTOR_AVAILABILITY"] });
    });
    it("ignora antecedência com aviso LEAD_TIME_SHORT", () =>
      expect(checkInvite(base({ now: min(S(1).startAt, -2), override: { ignoreLeadTime: true } }))).toEqual({
        ok: true,
        warnings: ["LEAD_TIME_SHORT"],
      }));
    it("override NÃO ignora mentora desativada nem mesa inativa", () => {
      const o = { override: { ignoreAvailability: true, ignoreLeadTime: true } };
      expect(checkInvite(base({ ...o, mentor: { ...mentor, status: "disabled" } })).ok).toBe(false);
      expect(checkInvite(base({ ...o, table: { active: false } })).ok).toBe(false);
    });
    it("sem override, flags ausentes não ignoram nada", () =>
      expect(checkInvite(base({ now: min(S(1).startAt, -2), override: {} })).ok).toBe(false));
  });

  it("convite de última hora expira no início do horário para permitir a confirmação", () => {
    const now = min(S(1).startAt, -2);
    expect(computeExpiry(now, S(1).startAt, 15, 0)).toEqual(S(1).startAt);
  });
});
