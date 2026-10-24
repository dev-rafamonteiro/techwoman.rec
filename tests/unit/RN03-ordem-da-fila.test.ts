import { describe, expect, it } from "vitest";
import { sortQueue } from "@tw/api/domain";

const d = (m: number) => new Date(Date.UTC(2026, 10, 14, 12, m));

describe("RN03 ordem da fila", () => {
  it("prioridade primeiro, depois queuedAt mais antigo", () => {
    const out = sortQueue([
      { id: "a", priority: false, queuedAt: d(1) },
      { id: "b", priority: false, queuedAt: d(0) },
      { id: "c", priority: true, queuedAt: d(30) },
      { id: "d", priority: true, queuedAt: d(10) },
    ]);
    expect(out.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
  it("não muta a entrada e desempata por id", () => {
    const input = [
      { id: "z", priority: false, queuedAt: d(0) },
      { id: "y", priority: false, queuedAt: d(0) },
    ];
    expect(sortQueue(input).map((x) => x.id)).toEqual(["y", "z"]);
    expect(input[0]!.id).toBe("z");
  });
  it("quem volta com prioridade e queuedAt original fica na frente dos novos sem prioridade", () => {
    const out = sortQueue([
      { id: "novo", priority: false, queuedAt: d(50) },
      { id: "voltou", priority: true, queuedAt: d(5) },
    ]);
    expect(out[0]!.id).toBe("voltou");
  });
});
