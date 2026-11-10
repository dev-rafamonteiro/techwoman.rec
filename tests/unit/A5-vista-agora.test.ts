import { describe, expect, it } from "vitest";
import { nowWindow } from "../../src/web/pages/admin/lib/now-window.js";

/** A5: o botão "Agora" mostra o horário atual e os 3 seguintes. */
describe("A5 · vista Agora", () => {
  const slots = Array.from({ length: 9 }, (_, i) => {
    const start = Date.UTC(2026, 10, 14, 13, 0) + i * 45 * 60_000;
    return { id: `s${i}`, startAt: new Date(start).toISOString(), endAt: new Date(start + 45 * 60_000).toISOString() };
  });
  const ids = (now: number) => nowWindow(slots, now).visible.map((s) => s.id);
  const at = (h: number, m: number) => Date.UTC(2026, 10, 14, h, m);

  it("horário em andamento + 3 seguintes", () => {
    expect(ids(at(14, 0))).toEqual(["s1", "s2", "s3", "s4"]);
    expect(nowWindow(slots, at(14, 0)).currentIdx).toBe(1);
  });
  it("antes do evento: o primeiro horário + 3 seguintes", () => {
    expect(ids(Date.UTC(2026, 10, 10, 18, 0))).toEqual(["s0", "s1", "s2", "s3"]);
  });
  it("perto do fim: só os que restam", () => {
    expect(ids(at(18, 30))).toEqual(["s7", "s8"]);
  });
  it("depois do último horário: o dia inteiro", () => {
    expect(ids(at(21, 0))).toHaveLength(9);
  });
});
