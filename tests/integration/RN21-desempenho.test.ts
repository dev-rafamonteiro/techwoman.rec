import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { loadApi, type Res } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { menteeDoc } from "../helpers/seed.js";
import { MENTEES_TEXT_INDEX, ensureSearchIndex, waitForCount } from "../helpers/search.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN21 · desempenho e concorrência do atendimento fora da mesa no mongo-local (Atlas Search local), com ~500
 * participantes: latência de E51 e E50, corrida do cadastro rápido com o mesmo e-mail, cadastros distintos em
 * paralelo e o atraso até a inscrição nova aparecer no `$search`. Os números saem no console.
 */
const api = await loadApi();
const N = 500;
const FIRST = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Mariana", "Natália", "Patrícia", "Renata", "Sabrina", "Tatiana", "Vanessa", "Yasmin", "Joana"];
const LAST = ["Albuquerque", "Barbosa", "Cavalcanti", "Duarte", "Esteves", "Ferraz", "Guimarães", "Holanda", "Lacerda", "Monteiro", "Nogueira", "Oliveira", "Pessoa", "Queiroz", "Rezende", "Siqueira", "Teixeira", "Uchoa", "Vasconcelos", "Lima"];
const AREAS = ["dados", "backend", "frontend", "ux", "produto", "cloud"];

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)]!;
};
const stats = (xs: number[]) => ({ n: xs.length, p50: +pct(xs, 50).toFixed(1), p95: +pct(xs, 95).toFixed(1), max: +Math.max(...xs).toFixed(1) });

describe.skipIf(!api)("RN21 · desempenho (500 participantes, mongo-local)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;

  beforeAll(async () => {
    // mede o banco e a rota, não o limite de E51 (30/min por sessão, coberto no teste funcional)
    b = await bootApi(api!, "rn21perf", { mentors: 4, mentees: 0, env: { RATE_LIMIT: "false" } });
    c = getCollections(b.t.db);
    const docs = Array.from({ length: N }, (_, i) => {
      const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${i}`;
      return menteeDoc(1000 + i, { name, area: AREAS[i % AREAS.length]!, note: i % 3 === 0 ? "Quero migrar de carreira para tecnologia" : null } as never).doc;
    });
    await c.mentees.insertMany(docs);
    const col = b.t.db.collection("mentees");
    await ensureSearchIndex(col, MENTEES_TEXT_INDEX);
    await waitForCount(() => col.aggregate([{ $search: { index: "mentees_text", text: { query: "Vasconcelos", path: "name" } } }, { $limit: 100 }]).toArray(), 20);
  }, 300_000);

  afterAll(async () => {
    if (b) {
      const col = b.t.db.collection("mentees");
      for (const ix of await col.listSearchIndexes().toArray()) await col.dropSearchIndex(ix.name).catch(() => {});
      await b.close();
    }
  });

  const timed = async (fn: () => Promise<Res>): Promise<[Res, number]> => {
    const t0 = performance.now();
    const r = await fn();
    return [r, performance.now() - t0];
  };

  it("E51 · 50 registros seguidos (participantes na fila): p95 < 300 ms", async () => {
    const targets = await c.mentees.find({ status: "waiting" }).sort({ queuedAt: 1 }).limit(50).toArray();
    const times: number[] = [];
    for (const m of targets) {
      const [r, ms] = await timed(() => b.mentor[0]!.post("/api/mentor/walk-ins", { menteeId: String(m._id), note: "Conversa rápida no corredor" }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      times.push(ms);
    }
    const s = stats(times);
    console.log(`[RN21 desempenho] E51 sequencial (ms): ${JSON.stringify(s)}`);
    expect(await c.mentees.countDocuments({ _id: { $in: targets.map((t) => t._id) }, status: "done" })).toBe(50);
    expect(s.p95).toBeLessThan(300);
  });

  it("E51 · 20 cadastros rápidos simultâneos com o MESMO e-mail novo: uma inscrição só, nenhum 500", async () => {
    const email = "corrida.mesmo.email@exemplo.test";
    const t0 = performance.now();
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        b.mentor[i % 4]!.post("/api/mentor/walk-ins", { newMentee: { name: `Corrida ${i}`, email, area: "dados" }, consentAccepted: true }),
      ),
    );
    const ms = performance.now() - t0;
    const byStatus = rs.reduce<Record<number, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
    const outcomes = rs.filter((r) => r.status === 201).map((r) => r.body.outcome as string);
    console.log(`[RN21 desempenho] 20 simultâneos mesmo e-mail: ${ms.toFixed(1)} ms no total; status ${JSON.stringify(byStatus)}; outcomes ${JSON.stringify(outcomes)}`);
    expect(rs.every((r) => r.status === 201 || r.status === 409), JSON.stringify(byStatus)).toBe(true);
    expect(rs.filter((r) => r.status === 409).every((r) => r.body.code === "CONFLICT")).toBe(true);
    expect(await c.mentees.countDocuments({ emailNorm: email })).toBe(1);
    expect(outcomes.filter((o) => o === "created")).toHaveLength(1);
    // uma por mentora (4 mentoras): o par mentora × participante é único
    expect(outcomes).toHaveLength(4);
    const m = (await c.mentees.findOne({ emailNorm: email }))!;
    expect(await c.walkIns.countDocuments({ menteeId: m._id, deletedAt: null })).toBe(4);
    expect(await c.outbox.countDocuments({ menteeId: m._id, type: "registered" })).toBe(1);
  });

  it("E51 · 20 cadastros rápidos simultâneos distintos: todos 201", async () => {
    const t0 = performance.now();
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        b.mentor[i % 4]!.post("/api/mentor/walk-ins", { newMentee: { name: `Paralela ${i}`, email: `paralela${i}@exemplo.test`, area: AREAS[i % AREAS.length] }, consentAccepted: true }),
      ),
    );
    const ms = performance.now() - t0;
    console.log(`[RN21 desempenho] 20 simultâneos distintos: ${ms.toFixed(1)} ms no total; status ${JSON.stringify(rs.map((r) => r.status))}`);
    expect(rs.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(await c.mentees.countDocuments({ emailNorm: /^paralela\d+@exemplo\.test$/, status: "done" })).toBe(20);
  });

  it("E50 · 30 buscas com erro de digitação: p95 < 500 ms", async () => {
    const queries = Array.from({ length: 30 }, (_, i) => {
      const first = FIRST[i % FIRST.length]!;
      const last = LAST[(i * 7) % LAST.length]!;
      // troca duas letras do sobrenome (erro de digitação) em metade das buscas
      const typo = i % 2 ? last.slice(0, 2) + last[3] + last[2] + last.slice(4) : last;
      return `${first} ${typo}`;
    });
    const times: number[] = [];
    let empty = 0;
    for (const q of queries) {
      const [r, ms] = await timed(() => b.mentor[3]!.get(`/api/mentor/mentees/search?q=${encodeURIComponent(q)}`));
      expect(r.status, q).toBe(200);
      expect(r.body.items.length).toBeLessThanOrEqual(20);
      if (r.body.items.length === 0) empty++;
      times.push(ms);
    }
    const s = stats(times);
    console.log(`[RN21 desempenho] E50 busca (ms): ${JSON.stringify(s)}; buscas sem resultado: ${empty}`);
    expect(empty).toBe(0);
    expect(s.p95).toBeLessThan(500);
  });

  it("inscrição nova (E51) aparece no $search do atlas-local em até 15 s", async () => {
    const name = "Zuleica Perfdemora";
    const r = await b.mentor[1]!.post("/api/mentor/walk-ins", { newMentee: { name, email: "zuleica.perfdemora@exemplo.test", area: "dados" }, consentAccepted: true });
    expect(r.status).toBe(201);
    const t0 = performance.now();
    let lag = -1;
    while (performance.now() - t0 < 15_000) {
      const found = await c.mentees.aggregate([{ $search: { index: "mentees_text", text: { query: "Perfdemora", path: "name" } } }, { $limit: 1 }], { readConcern: { level: "local" } }).toArray();
      if (found.length) {
        lag = performance.now() - t0;
        break;
      }
      await new Promise((res) => setTimeout(res, 100));
    }
    console.log(`[RN21 desempenho] atraso até a inscrição nova aparecer no $search: ${lag < 0 ? "não apareceu em 15 s" : `${lag.toFixed(0)} ms`}`);
    expect(lag).toBeGreaterThanOrEqual(0);
    // e a mentora encontra pela busca de E50
    const s = await b.mentor[2]!.get(`/api/mentor/mentees/search?q=${encodeURIComponent("Zuleika Perfdemora")}`);
    expect((s.body.items as any[]).map((i) => i.mentee.name)).toContain(name);
  }, 30_000);
});
