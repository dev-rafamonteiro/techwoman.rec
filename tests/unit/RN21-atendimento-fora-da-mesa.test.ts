import { describe, expect, it } from "vitest";
import { E51BodySchema } from "@tw/shared";
import { shouldRestoreToQueue, walkInQueueEffect, walkInSituation } from "@tw/api/domain";

describe("RN21 · atendimento fora da mesa: efeito na fila", () => {
  it("aguardando vira concluída e sai da fila", () => {
    expect(walkInQueueEffect("waiting")).toEqual({ ok: true, next: "done", leavesQueue: true });
  });
  it.each(["invited", "confirmed", "done", "no_show"] as const)("%s não muda (a mentoria da mesa continua)", (status) => {
    expect(walkInQueueEffect(status)).toEqual({ ok: true, next: status, leavesQueue: false });
  });
  it("cancelada não pode ser escolhida", () => expect(walkInQueueEffect("cancelled")).toEqual({ ok: false }));
});

describe("RN21 · remoção pelo admin (E53): volta à fila só quando saiu dela pelo atendimento", () => {
  const base = { previousMenteeStatus: "waiting" as const, currentStatus: "done" as const, hasAppointment: false, otherActiveWalkIns: 0 };
  it("aguardava, está concluída, sem mentoria nem outro atendimento -> volta", () => expect(shouldRestoreToQueue(base)).toBe(true));
  it.each([
    ["estava confirmada antes", { previousMenteeStatus: "confirmed" as const }],
    ["foi cadastrada no atendimento", { previousMenteeStatus: null }],
    ["já não está concluída", { currentStatus: "cancelled" as const }],
    ["tem mentoria na mesa", { hasAppointment: true }],
    ["outra mentora também a atendeu", { otherActiveWalkIns: 1 }],
  ])("não volta: %s", (_l, over) => expect(shouldRestoreToQueue({ ...base, ...over })).toBe(false));
});

describe("RN21 · situação mostrada em M7 (E50)", () => {
  it.each([
    ["waiting", false, "waiting"],
    ["invited", false, "scheduled"],
    ["confirmed", false, "scheduled"],
    ["done", false, "done"],
    ["no_show", false, "no_show"],
    ["done", true, "walked_in_by_me"],
    ["waiting", true, "walked_in_by_me"],
  ] as const)("%s (já atendida por mim: %s) -> %s", (status, walkedInByMe, expected) => {
    expect(walkInSituation({ status, walkedInByMe })).toBe(expected);
  });
});

describe("RN21 · contrato de E51", () => {
  it("aceita participante existente ou cadastro rápido com aceite", () => {
    expect(E51BodySchema.safeParse({ menteeId: "abc", note: "conversa rápida" }).success).toBe(true);
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ANA@x.com", area: "dados" }, consentAccepted: true }).success).toBe(true);
  });
  it("recusa cadastro sem aceite, nota longa ou os dois formatos juntos", () => {
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" } }).success).toBe(false);
    expect(E51BodySchema.safeParse({ newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" }, consentAccepted: false }).success).toBe(false);
    expect(E51BodySchema.safeParse({ menteeId: "abc", note: "x".repeat(501) }).success).toBe(false);
    expect(E51BodySchema.safeParse({ menteeId: "abc", newMentee: { name: "Ana Souza", email: "ana@x.com", area: "dados" }, consentAccepted: true }).success).toBe(false);
  });
});
