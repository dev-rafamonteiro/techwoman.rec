import { describe, expect, it } from "vitest";
import { remainingSlotCapacity } from "@tw/api/domain";
import { filterMentors, initials, normalizeSearch, resultCountLabel, searchText } from "../../src/web/pages/public/lib/mentoras.js";

const mentor = (over: Partial<Parameters<typeof searchText>[0]> = {}) => ({
  name: "Ana Vitória de Souza Cruz",
  organization: "Bradesco",
  areas: [{ key: "dados", label: "Dados e IA" }],
  themes: ["Transição de carreira"],
  bio: "Engenheira de dados com certificações Azure.",
  ...over,
});

describe("P7 · busca de mentoras", () => {
  it("normalizeSearch: sem acento, minúsculas e espaços simples", () => {
    expect(normalizeSearch("  Liderança   TÉCNICA ")).toBe("lideranca tecnica");
    expect(normalizeSearch("Júlia Sobral M.")).toBe("julia sobral m.");
    expect(normalizeSearch("")).toBe("");
  });

  it("initials: primeiro e último nome; nome único = uma letra; ignora títulos depois da vírgula", () => {
    expect(initials("Ana Vitória de Souza Cruz")).toBe("AC");
    expect(initials("Adriana Ribeiro, M.Sc")).toBe("AR");
    expect(initials("  ísis  ")).toBe("Í");
    expect(initials("Júlia Sobral M.")).toBe("JM");
    expect(initials("")).toBe("?");
  });

  it("procura em nome, empresa, rótulo da área, temas e bio, sem diferenciar acento e maiúscula", () => {
    const list = [mentor(), mentor({ name: "Beatriz Benz", organization: "Outra", areas: [{ key: "qa", label: "Qualidade" }], themes: ["Liderança"], bio: null })];
    const names = (q: string) => filterMentors(list, q).map((m) => m.name);
    expect(names("CRUZ")).toEqual(["Ana Vitória de Souza Cruz"]);
    expect(names("bradesco")).toEqual(["Ana Vitória de Souza Cruz"]);
    expect(names("dados e ia")).toEqual(["Ana Vitória de Souza Cruz"]);
    expect(names("transicao")).toEqual(["Ana Vitória de Souza Cruz"]);
    expect(names("azure")).toEqual(["Ana Vitória de Souza Cruz"]);
    expect(names("lideranca")).toEqual(["Beatriz Benz"]);
    expect(names("qualidade benz")).toEqual(["Beatriz Benz"]); // cada palavra em qualquer campo
    expect(names("qualidade azure")).toEqual([]);
    expect(names("   ")).toEqual(["Ana Vitória de Souza Cruz", "Beatriz Benz"]);
    expect(names("xyz")).toEqual([]);
  });

  it("contagem de resultados", () => {
    expect(resultCountLabel(23, 23)).toBe("23 mentoras");
    expect(resultCountLabel(1, 1)).toBe("1 mentora");
    expect(resultCountLabel(2, 23)).toBe("2 de 23 mentoras");
    expect(resultCountLabel(0, 23)).toBe("0 de 23 mentoras");
  });
});

describe("vagas restantes nos horários futuros (E30 e E54)", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const at = (h: number) => new Date(`2026-11-14T${String(h).padStart(2, "0")}:00:00Z`);
  const slots = [{ id: "s01", startAt: at(11) }, { id: "s02", startAt: at(12) }, { id: "s03", startAt: at(13) }, { id: "s04", startAt: at(14) }];
  const m = (o: Record<string, number>) => new Map(Object.entries(o));

  it("ignora horário que já começou; limita pelas mesas; desconta as marcadas; nunca negativo", () => {
    const n = remainingSlotCapacity({
      slots,
      now,
      activeTables: 3,
      mentorsBySlot: m({ s01: 3, s02: 3, s03: 5, s04: 1 }),
      bookedBySlot: m({ s03: 1, s04: 2 }),
    });
    // s01 e s02 já começaram; s03: min(3,5)-1 = 2; s04: max(0, 1-2) = 0
    expect(n).toBe(2);
  });

  it("sem mesas ou sem mentoras = 0", () => {
    expect(remainingSlotCapacity({ slots, now, activeTables: 0, mentorsBySlot: m({ s03: 4 }), bookedBySlot: m({}) })).toBe(0);
    expect(remainingSlotCapacity({ slots, now, activeTables: 4, mentorsBySlot: m({}), bookedBySlot: m({}) })).toBe(0);
  });
});
