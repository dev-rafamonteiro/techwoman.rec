import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";

/**
 * Decisão do usuário: a busca é só full text. Se o `$search` falhar, E22, E31 e E35 respondem 503, nunca 500.
 * Gancho de falha: `searchOverrides.search` (função que lança) no contexto da API, combinado com o backend.
 */
const api = await loadApi();

describe.skipIf(!api)("falha do $search: 503 em E22, E31 e E35 (nunca 500)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "busca503", {
      mentors: 2,
      mentees: 3,
      searchOverrides: {
        search: async () => {
          throw Object.assign(new Error("mongot indisponível"), { code: 6 });
        },
      },
    });
  });
  afterAll(async () => b?.close());

  const cases: [string, () => ReturnType<Booted["admin"]["get"]>][] = [
    ["E22 /mentor/queue?q=", () => b.mentor[0]!.get("/api/mentor/queue?q=dados")],
    ["E35 /admin/mentees?q=", () => b.admin.get("/api/admin/mentees?q=dados")],
    ["E31 /admin/mentors?q=", () => b.admin.get("/api/admin/mentors?q=dados")],
  ];

  it.each(cases)("%s responde 503 com corpo de erro padrão e sem vazar a causa", async (_n, call) => {
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.code).toEqual(expect.any(String));
    expect(JSON.stringify(r.body)).not.toMatch(/mongot|stack|MongoServerError/i);
  });

  it("sem q as listas seguem funcionando (não passam pelo $search)", async () => {
    expect((await b.mentor[0]!.get("/api/mentor/queue")).status).toBe(200);
    expect((await b.admin.get("/api/admin/mentees")).status).toBe(200);
    expect((await b.admin.get("/api/admin/mentors")).status).toBe(200);
  });
});
