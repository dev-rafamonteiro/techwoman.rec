import { describe, expect, it } from "vitest";
import { fullSlotsForAdditions, overCapacitySlots, slotFullMessage } from "@tw/api/domain";

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe("RN22 limite de mentoras por horário", () => {
  it("horário adicionado com as outras mentoras >= mesas fica lotado; com uma vaga passa", () => {
    expect(fullSlotsForAdditions({ current: [], next: ["s01", "s02"], others: m({ s01: 23, s02: 22 }), capacity: 23 })).toEqual([
      { slotId: "s01", mentorsAvailable: 23, capacity: 23 },
    ]);
  });
  it("manter horário já salvo nunca bloqueia, mesmo acima do limite (sem remoção retroativa)", () => {
    expect(fullSlotsForAdditions({ current: ["s01"], next: ["s01"], others: m({ s01: 30 }), capacity: 23 })).toEqual([]);
  });
  it("remover nunca bloqueia", () => {
    expect(fullSlotsForAdditions({ current: ["s01", "s02"], next: [], others: m({ s01: 99, s02: 99 }), capacity: 1 })).toEqual([]);
  });
  it("sem mesa ativa (capacidade 0) todo horário novo está lotado; horário sem ninguém conta 0", () => {
    expect(fullSlotsForAdditions({ current: [], next: ["s03"], others: m({}), capacity: 0 })).toEqual([{ slotId: "s03", mentorsAvailable: 0, capacity: 0 }]);
    expect(fullSlotsForAdditions({ current: [], next: ["s03"], others: m({}), capacity: 1 })).toEqual([]);
  });
  it("ids repetidos contam uma vez; ordem de `next`", () => {
    expect(fullSlotsForAdditions({ current: [], next: ["s02", "s01", "s02"], others: m({ s01: 2, s02: 2 }), capacity: 2 }).map((s) => s.slotId)).toEqual(["s02", "s01"]);
  });
  it("overCapacitySlots: só o que passa (>) do limite; igual ao limite não é aviso", () => {
    expect(overCapacitySlots(m({ s01: 3, s02: 2, s03: 0 }), 2, ["s01", "s02", "s03"])).toEqual([{ slotId: "s01", mentorsAvailable: 3, capacity: 2 }]);
  });
  it("mensagem do SLOT_FULL: um horário e vários", () => {
    expect(slotFullMessage([{ label: "10h00", mentorsAvailable: 23, capacity: 23 }])).toBe("O horário 10h00 já está lotado (23 de 23 mesas).");
    expect(
      slotFullMessage([
        { label: "10h00", mentorsAvailable: 23, capacity: 23 },
        { label: "10h45", mentorsAvailable: 24, capacity: 23 },
        { label: "11h30", mentorsAvailable: 23, capacity: 23 },
      ]),
    ).toBe("Os horários 10h00 (23 de 23 mesas), 10h45 (23 de 23 mesas) e 11h30 (23 de 23 mesas) já estão lotados.");
  });
  it("mensagem do SLOT_FULL: acima do limite não passa de N de N; sem mesa ativa tem frase própria", () => {
    expect(slotFullMessage([{ label: "10h00", mentorsAvailable: 25, capacity: 23 }])).toBe("O horário 10h00 já está lotado (23 de 23 mesas).");
    expect(slotFullMessage([{ label: "10h00", mentorsAvailable: 0, capacity: 0 }])).toBe("Ainda não há mesas ativas para o horário 10h00.");
    expect(
      slotFullMessage([
        { label: "10h00", mentorsAvailable: 1, capacity: 0 },
        { label: "10h45", mentorsAvailable: 0, capacity: 0 },
      ]),
    ).toBe("Ainda não há mesas ativas para os horários 10h00 e 10h45.");
  });
});
