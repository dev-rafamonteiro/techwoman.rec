import { describe, expect, it } from "vitest";
import { computeExpiry } from "@tw/api/domain";
import { S, min } from "./_util.js";

describe("RN05 prazo do convite", () => {
  it("horário distante: agora + 15 min", () => {
    const now = min(S(5).startAt, -120);
    expect(computeExpiry(now, S(5).startAt, 15)).toEqual(min(now, 15));
  });
  it("horário próximo: início - 5 min", () => {
    const now = min(S(5).startAt, -12);
    expect(computeExpiry(now, S(5).startAt, 15)).toEqual(min(S(5).startAt, -5));
  });
  it("empate (início - 5 == agora + 15)", () => {
    const now = min(S(5).startAt, -20);
    expect(computeExpiry(now, S(5).startAt, 15)).toEqual(min(S(5).startAt, -5));
  });
  it("respeita responseWindowMinutes configurado", () => {
    const now = min(S(5).startAt, -300);
    expect(computeExpiry(now, S(5).startAt, 30)).toEqual(min(now, 30));
  });
});
