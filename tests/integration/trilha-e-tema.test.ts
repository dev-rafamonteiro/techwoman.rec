import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** A trilha é o grupo; o tema é um item dela. A participante escolhe a trilha e o tema; a trilha da mentora sai dos temas. */
const api = await loadApi();

const body = (over: Record<string, unknown>) => ({
  name: "Maria Silva", phone: "81912345678", area: "desenvolvimento", preferredPeriod: "morning",
  consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok", ...over,
});

describe.skipIf(!api)("trilha e tema", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const m = (i: number) => b.w.mentors[i]!;

  beforeAll(async () => {
    b = await bootApi(api!, "trilhas", { mentors: 3, mentees: 0 });
    c = getCollections(b.t.db);
    await b.t.db.collection("events").updateOne({}, { $set: { areas: [
      { key: "desenvolvimento", label: "Desenvolvimento" }, { key: "dados", label: "Dados" }, { key: "gestao-e-agilidade", label: "Gestão" },
    ] } });
  }, 120_000);
  afterAll(async () => {
    if (b) await b.close();
  });

  it("E02 guarda o tema da trilha e a mentora vê na fila", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ email: "tema@y.test", theme: "Desenvolvimento Back-end" }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await c.mentees.findOne({ emailNorm: "tema@y.test" }))?.theme).toBe("Desenvolvimento Back-end");
    const q = await b.mentor[0]!.get("/api/mentor/queue");
    expect(q.body.items.find((i: { name: string; theme: string | null }) => i.theme === "Desenvolvimento Back-end")).toBeTruthy();
  });

  it("E02 aceita inscrição sem tema", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ email: "sem-tema@y.test" }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await c.mentees.findOne({ emailNorm: "sem-tema@y.test" }))?.theme).toBeNull();
  });

  it("E02 recusa tema de outra trilha e tema fora do catálogo, apontando o campo", async () => {
    for (const theme of ["Engenharia de Dados", "Tema inventado"]) {
      const r = await b.anon.post("/api/public/mentees", body({ email: "errado@y.test", theme }));
      expect(r.status).toBe(422);
      expect(r.body.details.field).toBe("theme");
    }
  });

  it("E32: as trilhas da mentora saem dos temas", async () => {
    const r = await b.admin.patch(`/api/admin/mentors/${m(0)._id}`, { themes: ["Engenharia de Dados", "Agilidade"], themeDomains: [[], []] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.users.findOne({ _id: m(0)._id }))?.areas).toEqual(["dados", "gestao-e-agilidade"]);
  });

  it("E32 com tema fora do catálogo mantém as trilhas e o tema", async () => {
    const before = (await c.users.findOne({ _id: m(1)._id }))?.areas;
    const r = await b.admin.patch(`/api/admin/mentors/${m(1)._id}`, { themes: ["Tema próprio"], themeDomains: [[]] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = await c.users.findOne({ _id: m(1)._id });
    expect(after?.areas).toEqual(before);
    expect(after?.themes).toEqual(["Tema próprio"]);
  });

  it("E28: a mentora troca o tema e a trilha acompanha", async () => {
    const r = await b.mentor[2]!.patch("/api/mentor/profile", { themes: ["Desenvolvimento SAP"] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.users.findOne({ _id: m(2)._id }))?.areas).toEqual(["desenvolvimento"]);
  });
});
