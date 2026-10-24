import { describe, expect, it } from "vitest";
import { blockedAvailabilityRemovals, checkAvailabilityUpdate, mentorDisableBlockers } from "@tw/api/domain";
import { S, min } from "./_util.js";

const all = ["s01", "s02", "s03", "s04"];

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
