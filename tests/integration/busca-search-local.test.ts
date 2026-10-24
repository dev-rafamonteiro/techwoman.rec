import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db.js";
import { MENTEES_TEXT_INDEX, ensureSearchIndex, waitForCount } from "../helpers/search.js";
import { EVENT_ID, buildMentees, buildMentors, type MenteeSeed } from "../fixtures/busca.js";

/**
 * PLAN, "Testes da busca", caixa 1: `$search` com filtros e acentos no mongodb-atlas-local.
 * A consulta é o estágio `$search` da pipeline híbrida do PLAN (E22 com `q`), sem a parte vetorial.
 */
describe("$search no mongo-local: filtros e acentos (índice mentees_text do PLAN)", () => {
  let t: TestDb;
  let seeds: MenteeSeed[];
  const col = () => t.db.collection("mentees");

  const search = async (q: string, extraFilter: object[] = [], status: "waiting" | "invited" = "waiting") =>
    col()
      .aggregate([
        {
          $search: {
            index: "mentees_text",
            compound: {
              should: [
                { text: { query: q, path: ["name", "note"], fuzzy: { maxEdits: 1 } } },
                { autocomplete: { query: q, path: "name" } },
              ],
              filter: [{ equals: { path: "eventId", value: EVENT_ID } }, { equals: { path: "status", value: status } }, ...extraFilter],
              minimumShouldMatch: 1,
            },
          },
        },
        { $limit: 50 },
      ])
      .toArray();
  const names = (r: any[]) => r.map((d) => d.name as string);

  beforeAll(async () => {
    t = await createTestDb("buscalocal");
    seeds = buildMentees();
    await col().insertMany(seeds.map((s) => ({ ...s, eventId: EVENT_ID })));
    await ensureSearchIndex(col(), MENTEES_TEXT_INDEX);
    await waitForCount(() => search("transição"), 1);
  }, 300_000);

  afterAll(async () => {
    if (!t) return;
    const c = col();
    for (const ix of await c.listSearchIndexes().toArray()) await c.dropSearchIndex(ix.name).catch(() => {});
    await t.drop();
  });

  it("massa: 30 participantes e 10 mentoras, sem contato em note", () => {
    expect(seeds).toHaveLength(30);
    expect(buildMentors()).toHaveLength(10);
    for (const s of seeds) {
      for (const field of [s.note]) {
        expect(field).not.toContain(s.email);
        expect(field).not.toContain(s.phone);
        expect(field).not.toMatch(/@|\+55|\d{8,}/);
        expect(field).not.toContain(s.name);
      }
    }
    for (const m of buildMentors()) expect(m.bio).not.toMatch(/@|\d{8,}/);
  });

  it('"transicao" (sem acento) encontra "transição" no comentário', async () => {
    const r = names(await search("transicao"));
    expect(r).toEqual(expect.arrayContaining(["Joana Albuquerque", "Raquel Bezerra"]));
  });

  it('"TRANSIÇÃO" (maiúsculas e acento) acha os mesmos documentos que "transicao"', async () => {
    expect(names(await search("TRANSIÇÃO")).sort()).toEqual(names(await search("transicao")).sort());
  });

  it('"analise" encontra "análise" e "inteligencia" encontra "inteligência"', async () => {
    expect(names(await search("analise"))).toContain("Helena Vasconcelos");
    expect(names(await search("inteligencia"))).toContain("Isabela Rangel");
  });

  it("erro de digitação de 1 letra ainda encontra (fuzzy maxEdits 1)", async () => {
    expect(names(await search("carrera"))).toEqual(expect.arrayContaining(["Helena Vasconcelos"]));
  });

  it("autocomplete no nome ignora acentos: \"patri\" -> Patrícia, \"claud\" -> Cláudia, \"cláu\" -> Cláudia", async () => {
    expect(names(await search("patri"))).toContain("Patrícia Santana");
    expect(names(await search("claud"))).toContain("Cláudia Menezes");
    expect(names(await search("cláu"))).toContain("Cláudia Menezes");
  });

  it("filtro de status: a participante convidada não vem em status=waiting, mas vem em status=invited", async () => {
    expect(names(await search("máquina"))).not.toContain("Eliane Prado");
    expect(names(await search("máquina"))).toContain("Isabela Rangel");
    expect(names(await search("máquina", [], "invited"))).toEqual(["Eliane Prado"]);
  });

  it("filtro de área (token) restringe o resultado", async () => {
    const all = await search("carreira");
    expect(all.length).toBeGreaterThan(1);
    const dados = await search("carreira", [{ equals: { path: "area", value: "dados" } }]);
    expect(dados.length).toBeGreaterThan(0);
    expect(dados.every((d) => d.area === "dados")).toBe(true);
    expect(dados.length).toBeLessThan(all.length);
  });

  it("filtro de evento: outro eventId não retorna nada", async () => {
    const r = await col()
      .aggregate([{ $search: { index: "mentees_text", compound: { must: [{ text: { query: "transição", path: "note" } }], filter: [{ equals: { path: "eventId", value: "outro-evento" } }] } } }])
      .toArray();
    expect(r).toHaveLength(0);
  });

  it("e-mail e telefone (keyword) casam só pelo valor exato", async () => {
    const s = seeds[3]!;
    const byEmail = await col().aggregate([{ $search: { index: "mentees_text", text: { query: s.email, path: "email" } } }]).toArray();
    expect(byEmail.map((d) => d.name)).toEqual([s.name]);
    const partial = await col().aggregate([{ $search: { index: "mentees_text", text: { query: "busca.participante", path: "email" } } }]).toArray();
    expect(partial).toHaveLength(0);
  });
});
