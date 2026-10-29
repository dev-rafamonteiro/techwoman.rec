import { describe, expect, it } from "vitest";
import { isRegistrationOpen } from "@tw/api/domain";
import { S, min } from "./_util.js";

describe("RN02 janela de inscrição", () => {
  const last = S(9).startAt;
  it("grade padrão tem 9 sessões de 45 minutos entre 10h e 16h45", () => {
    expect(Array.from({ length: 9 }, (_, i) => S(i + 1).startAt.toISOString())).toEqual([
      "2026-11-14T13:00:00.000Z",
      "2026-11-14T13:45:00.000Z",
      "2026-11-14T14:30:00.000Z",
      "2026-11-14T15:15:00.000Z",
      "2026-11-14T16:00:00.000Z",
      "2026-11-14T16:45:00.000Z",
      "2026-11-14T17:30:00.000Z",
      "2026-11-14T18:15:00.000Z",
      "2026-11-14T19:00:00.000Z",
    ]);
    expect(S(9).endAt.toISOString()).toBe("2026-11-14T19:45:00.000Z");
    expect(S(9).endAt.getTime() - S(9).startAt.getTime()).toBe(45 * 60_000);
  });
  it("aberta antes do início do último horário", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, min(last, -1))).toBe(true));
  it("fechada no instante exato do início do último horário", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, last)).toBe(false));
  it("fechada depois", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: last }, min(last, 60))).toBe(false));
  it("fechada se registrationOpen=false", () =>
    expect(isRegistrationOpen({ registrationOpen: false, lastSlotStartAt: last }, min(last, -600))).toBe(false));
  it("fechada sem grade", () =>
    expect(isRegistrationOpen({ registrationOpen: true, lastSlotStartAt: null }, new Date())).toBe(false));
});
