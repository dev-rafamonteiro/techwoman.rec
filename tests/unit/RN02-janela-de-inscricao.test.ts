import { describe, expect, it } from "vitest";
import { canUpdatePreferredPeriod, isRegistrationOpen, normalizeEmail, registrationOutcome } from "@tw/api/domain";
import { S, min } from "./_util.js";

describe("RN02 janela de inscrição", () => {
  const last = S(12).startAt;
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
