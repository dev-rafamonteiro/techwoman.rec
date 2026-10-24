import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { menteeDoc } from "../helpers/seed.js";
import { MENTEES_TEXT_INDEX, ensureSearchIndex, waitForCount } from "../helpers/search.js";
import { buildMentees } from "../fixtures/busca.js";

/**
 * PLAN, "Testes da busca", caixas 2 e 4, pela API (E22 com `q`, E35 com `q`) sobre o mongo-local com o índice mentees_text:
 * - participante já convidada nunca aparece no resultado, mesmo com o índice de busca atrasado;
 * - nenhuma resposta de E22 contém `email` ou `phone`.
 */
const api = await loadApi();

describe.skipIf(!api)("E22/E35 com q: convidada fora do resultado e sem contato (mongo-local)", () => {
  let b: Booted;
  let seeds: ReturnType<typeof buildMentees>;
  const ids = new Map<string, string>();

  beforeAll(async () => {
    b = await bootApi(api!, "buscaapi", { mentors: 2, mentees: 0 });
    seeds = buildMentees().filter((s) => s.status === "waiting");
    const docs = seeds.map((s, i) => {
      const { doc } = menteeDoc(i + 1, { name: s.name, email: s.email, emailNorm: s.email, phone: s.phone, area: s.area, note: s.note } as never);
      return doc;
    });
    await b.t.db.collection("mentees").insertMany(docs as never[]);
    for (const d of docs) ids.set(d.name, String(d._id));
    const col = b.t.db.collection("mentees");
    await ensureSearchIndex(col, MENTEES_TEXT_INDEX);
    await waitForCount(() => col.aggregate([{ $search: { index: "mentees_text", text: { query: "transição", path: "note" } } }]).toArray(), 1);
  }, 300_000);

  afterAll(async () => {
    if (b) {
      const col = b.t.db.collection("mentees");
      for (const ix of await col.listSearchIndexes().toArray()) await col.dropSearchIndex(ix.name).catch(() => {});
      await b.close();
    }
  });

  const queue = (q: string, who = 0) => b.mentor[who]!.get(`/api/mentor/queue?q=${encodeURIComponent(q)}`);
  const namesOf = (r: any) => (r.body.items as { name: string }[]).map((i) => i.name);

  it('E22 com q="transicao" encontra "transição" (acento) e responde 200', async () => {
    const r = await queue("transicao");
    expect(r.status).toBe(200);
    expect(namesOf(r)).toEqual(expect.arrayContaining(["Joana Albuquerque", "Raquel Bezerra"]));
  });

  it("participante convidada some do resultado na hora, sem esperar o índice de busca (índice atrasado)", async () => {
    const before = await queue("transicao");
    expect(namesOf(before)).toContain("Joana Albuquerque");
    const inv = await b.mentor[0]!.post("/api/mentor/appointments", {
      menteeId: ids.get("Joana Albuquerque"),
      slotId: b.w.slotIds[3]!,
      tableId: String(b.w.tables[0]!._id),
    });
    expect(inv.status).toBe(201);
    // consultas imediatas, repetidas, por todos os caminhos de texto: a convidada nunca volta
    for (const q of ["transicao", "transição", "Joana", "joana albuquerque", "programação", "saúde"]) {
      for (const who of [0, 1]) {
        const r = await queue(q, who);
        expect(r.status, q).toBe(200);
        expect(namesOf(r), `q=${q} mentora ${who}`).not.toContain("Joana Albuquerque");
      }
    }
    const adm = await b.admin.get(`/api/admin/mentees?q=${encodeURIComponent("Joana Albuquerque")}`);
    expect(adm.status).toBe(200);
    expect((adm.body.items as any[]).filter((i) => i.name === "Joana Albuquerque").every((i) => i.status !== "waiting")).toBe(true);
  });

  it("nenhuma resposta de E22 (com ou sem q, qualquer área) contém email ou phone, nem seus valores", async () => {
    const urls = ["/api/mentor/queue", ...["transicao", "dados", "carreira", "Cláudia", "patri", "aprendizado de máquina", "quero migrar para dados"].map((q) => `/api/mentor/queue?q=${encodeURIComponent(q)}`), "/api/mentor/queue?q=carreira&area=dados"];
    for (const url of urls) {
      const r = await b.mentor[0]!.get(url);
      expect(r.status, url).toBe(200);
      const text = JSON.stringify(r.body);
      for (const key of ["email", "emailNorm", "phone", "consent", "tokenHash"]) expect(text, `${url} ${key}`).not.toMatch(new RegExp(`"${key}"`));
      for (const s of seeds) {
        expect(text, url).not.toContain(s.email);
        expect(text, url).not.toContain(s.phone);
      }
    }
  });

  it("erros de digitação no nome encontram a participante, com o acerto exato primeiro (E22)", async () => {
    const cases: [string, string][] = [
      ["Mariana Teixeira", "mariana"], // exato
      ["Mariana Teixeira", "mariama"], // letra trocada
      ["Mariana Teixeira", "marina"], // letra faltando
      ["Mariana Teixeira", "teixiera"], // letras invertidas
      ["Gabriela Figueiredo", "figeuiredo"], // 2 erros em palavra longa
      ["Gabriela Figueiredo", "gabri"], // prefixo (autocomplete)
      ["Fernanda Lima", "fernada"], // letra faltando
      ["Cláudia Menezes", "claudia"], // sem acento
      ["Patrícia Santana", "patricai"], // letras invertidas
    ];
    for (const [name, q] of cases) {
      const r = await queue(q);
      expect(r.status, q).toBe(200);
      expect(namesOf(r), `q=${q}`).toContain(name);
    }
    expect(namesOf(await queue("mariana"))[0]).toBe("Mariana Teixeira");
  });

  it("E35 (admin) com q devolve contato, E22 (mentora) não", async () => {
    const adm = await b.admin.get(`/api/admin/mentees?q=${encodeURIComponent("transicao")}`);
    expect(adm.status).toBe(200);
    expect(adm.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(adm.body)).toMatch(/"email"/);
  });

  it("limites de q: 2 a 200 caracteres (422 fora disso)", async () => {
    for (const q of ["a", "x".repeat(201)]) {
      const r = await queue(q);
      expect([r.status, r.body.code], `q com ${q.length} caracteres`).toEqual([422, "VALIDATION_ERROR"]);
    }
    expect((await queue("ab")).status).toBe(200);
    expect((await queue("x".repeat(200))).status).toBe(200);
  });
});
