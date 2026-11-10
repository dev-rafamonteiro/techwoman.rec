import { describe, expect, it } from "vitest";
import { chooseTableForBooking } from "../../src/api/domain/invite.js";

/** RN24 · mesa da inscrição: continua onde a mentora atua, sem tomar a mesa de outra mentora no horário vizinho. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 14, h, m));
const tables = (...numbers: number[]) => numbers.map((n) => ({ id: `t${n}`, number: n }));
const NEIGHBOUR = 45 * 60_000;
const choose = (chosenStartAt: Date, appointments: { mentorId: string; tableId: string; startAt: Date }[], freeTables = tables(1, 2, 3)) =>
  chooseTableForBooking({ chosenStartAt, mentorId: "adriana", neighbourMs: NEIGHBOUR, appointments, freeTables, random: () => 0 })?.id;

describe("RN24 · chooseTableForBooking", () => {
  it("mantém a mesa da mentoria anterior da mentora (Adriana às 11h na mesa 2, nova às 11h45)", () => {
    expect(choose(at(11, 45), [{ mentorId: "adriana", tableId: "t2", startAt: at(11) }])).toBe("t2");
  });
  it("também olha a mentoria seguinte, porque as inscrições não chegam em ordem", () => {
    expect(choose(at(11), [{ mentorId: "adriana", tableId: "t3", startAt: at(11, 45) }])).toBe("t3");
  });
  it("empate entre antes e depois: fica a mesa da anterior", () => {
    expect(choose(at(12), [
      { mentorId: "adriana", tableId: "t3", startAt: at(12, 45) },
      { mentorId: "adriana", tableId: "t2", startAt: at(11, 15) },
    ])).toBe("t2");
  });
  it("mesa dela ocupada: tenta a da mentoria seguinte mais próxima", () => {
    expect(choose(at(12), [
      { mentorId: "adriana", tableId: "t9", startAt: at(11, 15) },
      { mentorId: "adriana", tableId: "t2", startAt: at(14) },
    ])).toBe("t2");
  });
  it("sem histórico: não toma a mesa que outra mentora usa no horário vizinho", () => {
    expect(choose(at(11, 45), [{ mentorId: "bia", tableId: "t1", startAt: at(11) }])).toBe("t2");
  });
  it("mesa de outra mentora longe do horário não atrapalha: entra no sorteio", () => {
    expect(choose(at(15), [{ mentorId: "bia", tableId: "t1", startAt: at(11) }])).toBe("t1");
  });
  it("todas as livres são vizinhas de outra mentora: usa mesmo assim uma delas", () => {
    expect(choose(at(11, 45), [{ mentorId: "bia", tableId: "t1", startAt: at(11) }], tables(1))).toBe("t1");
  });
  it("sem histórico: o sorteio espalha entre as mesas livres", () => {
    const pick = (r: number) => chooseTableForBooking({ chosenStartAt: at(11), mentorId: "adriana", neighbourMs: NEIGHBOUR, appointments: [], freeTables: tables(1, 2, 3), random: () => r })?.id;
    expect([pick(0), pick(0.5), pick(0.99)]).toEqual(["t1", "t2", "t3"]);
  });
  it("sem mesa livre: null", () => {
    expect(choose(at(11), [], [])).toBeUndefined();
  });
});
