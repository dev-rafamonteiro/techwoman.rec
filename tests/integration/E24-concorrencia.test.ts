import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb, type TestDb } from "../helpers/db.js";
import { seedWorld, userDoc, type World } from "../helpers/seed.js";
import { Client, loadApi, testPasswordHash, type Res } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";
import { SCHEDULE_CONFLICT_CODES } from "@tw/shared";

const api = await loadApi();
// Evento em 2026-11-14; "agora" fixo às 08:00 de Recife (antecedência de sobra, convite dentro da janela)
const NOW = new Date("2026-11-14T11:00:00Z");

describe.skipIf(!api)("E24 concorrência: 50 mentoras x mesmas 10 participantes (PLAN: testes obrigatórios)", () => {
  let t: TestDb;
  let app: FastifyInstance;
  const dbs: TestDb[] = [];
  const apps: FastifyInstance[] = [];

  async function setup(label: string, opts: { mentors: number; mentees: number; tables?: number }): Promise<{ w: World; clients: Client[] }> {
    t = await createTestDb(label);
    dbs.push(t);
    const w = await seedWorld(t.db, { mentors: opts.mentors, tables: opts.tables ?? 20, mentees: opts.mentees });
    const hash = await testPasswordHash();
    await getCollections(t.db).users.deleteMany({});
    w.mentors = Array.from({ length: opts.mentors }, (_, i) => userDoc(i + 1, { passwordHash: hash }));
    await getCollections(t.db).users.insertMany(w.mentors);
    app = await api!.buildApp({ db: t.db, client: t.client, now: () => NOW, });
    apps.push(app);
    const clients = await Promise.all(w.mentors.map(async (m) => {
      const c = new Client(app);
      const r = await c.login(m.email);
      expect(r.status, `login ${m.email}`).toBe(200);
      return c;
    }));
    return { w, clients };
  }
  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await Promise.all(dbs.map((d) => d.drop()));
  });

  const body = (menteeId: unknown, slotId: string, tableId: unknown) => ({ menteeId: String(menteeId), slotId, tableId: String(tableId) });
  const conflict = (r: Res) => r.status === 409 && (SCHEDULE_CONFLICT_CODES as readonly string[]).includes(r.body?.code);

  it("50 mentoras x 10 participantes (500 convites simultâneos): zero duplicidade de participante, mesa ou mentora", async () => {
    const { w, clients } = await setup("conc500", { mentors: 50, mentees: 10 });
    const sl = (i: number) => w.slotIds[i % 12]!;
    const jobs: Promise<Res>[] = [];
    clients.forEach((c, i) =>
      w.mentees.forEach((m, j) =>
        jobs.push(c.post("/api/mentor/appointments", body(m.doc._id, sl(i + j), w.tables[(i * 7 + j) % 20]!._id), { "idempotency-key": `k-${i}-${j}` })),
      ),
    );
    const res = await Promise.all(jobs);

    const created = res.filter((r) => r.status === 201 || r.status === 200);
    const rejected = res.filter((r) => !(r.status === 201 || r.status === 200));
    expect(rejected.every(conflict), `respostas inesperadas: ${JSON.stringify(rejected.filter((r) => !conflict(r)).slice(0, 3).map((r) => [r.status, r.body]))}`).toBe(true);
    expect(res.filter((r) => r.status >= 500)).toHaveLength(0);

    const { appointments, mentees } = getCollections(t.db);
    const active = await appointments.find({ menteeLock: true }).toArray();
    const locked = await appointments.find({ slotLock: true }).toArray();

    // sucessos HTTP == convites no banco == participantes invited
    expect(active.length).toBe(created.length);
    expect(await mentees.countDocuments({ status: "invited" })).toBe(active.length);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(10);

    const uniq = (xs: string[]) => new Set(xs).size === xs.length;
    expect(uniq(active.map((a) => String(a.menteeId))), "participante em dois lugares").toBe(true);
    expect(uniq(locked.map((a) => `${a.tableId}|${a.slotId}`)), "mesa dupla no horário").toBe(true);
    expect(uniq(locked.map((a) => `${a.mentorId}|${a.slotId}`)), "mentora dupla no horário").toBe(true);

    // quem perdeu continua waiting, sem convite pendurado (transação desfeita inteira)
    for (const m of await mentees.find({ status: "waiting" }).toArray()) {
      expect(m.currentAppointmentId).toBeNull();
      expect(active.some((a) => a.menteeId.equals(m._id))).toBe(false);
    }
    // consistência cruzada currentAppointmentId <-> convite
    for (const a of active) {
      const m = await mentees.findOne({ _id: a.menteeId });
      expect(m?.currentAppointmentId?.equals(a._id)).toBe(true);
    }
    // 1 outbox 'invite' por convite criado (dedupeKey invite:<id>), nenhuma para perdedores
    const inv = await t.db.collection("outbox").distinct("dedupeKey", { type: "invite" });
    expect(new Set(inv.map((k: string) => k.split(":")[1])).size).toBe(active.length);
    // 1 auditoria appointment.invite por convite
    expect(await t.db.collection("audit_logs").countDocuments({ action: "appointment.invite" })).toBe(active.length);
    // com 50 tentativas por participante, todas as 10 acabam convidadas
    expect(active.length).toBe(10);
  });

  it("todas as mentoras na MESMA participante: exatamente 1 vence, 49 recebem MENTEE_TAKEN", async () => {
    const { w, clients } = await setup("samementee", { mentors: 50, mentees: 1 });
    const res = await Promise.all(clients.map((c, i) => c.post("/api/mentor/appointments", body(w.mentees[0]!.doc._id, w.slotIds[i % 12]!, w.tables[i % 20]!._id))));
    expect(res.filter((r) => r.status === 201 || r.status === 200)).toHaveLength(1);
    const losers = res.filter((r) => r.status === 409);
    expect(losers).toHaveLength(49);
    // perdedoras por mesa/mentora também são válidas se colidirem antes; mas aqui mentoras e slots/mesas colidem pouco
    expect(losers.every((r) => ["MENTEE_TAKEN", "TABLE_TAKEN", "MENTOR_BUSY"].includes(r.body.code))).toBe(true);
    expect(losers.filter((r) => r.body.code === "MENTEE_TAKEN").length).toBeGreaterThan(0);
    expect(await getCollections(t.db).appointments.countDocuments({ menteeLock: true })).toBe(1);
  });

  it("20 mentoras, 20 participantes distintas, MESMA mesa e MESMO horário: 1 vence, 19 TABLE_TAKEN, participantes das perdedoras seguem waiting", async () => {
    const { w, clients } = await setup("sametable", { mentors: 20, mentees: 20 });
    const res = await Promise.all(clients.map((c, i) => c.post("/api/mentor/appointments", body(w.mentees[i]!.doc._id, "s02", w.tables[0]!._id))));
    expect(res.filter((r) => r.status === 201 || r.status === 200)).toHaveLength(1);
    const losers = res.filter((r) => r.status === 409);
    expect(losers).toHaveLength(19);
    expect(losers.every((r) => r.body.code === "TABLE_TAKEN")).toBe(true);
    const { mentees } = getCollections(t.db);
    expect(await mentees.countDocuments({ status: "waiting" })).toBe(19);
    expect(await mentees.countDocuments({ status: "invited" })).toBe(1);
  });

  it("mesma mentora (duas abas) em participantes distintas, MESMO horário, mesas diferentes: 1 vence, o resto MENTOR_BUSY", async () => {
    const { w, clients } = await setup("samementor", { mentors: 1, mentees: 10 });
    const res = await Promise.all(w.mentees.map((m, j) => clients[0]!.post("/api/mentor/appointments", body(m.doc._id, "s03", w.tables[j]!._id))));
    expect(res.filter((r) => r.status === 201 || r.status === 200)).toHaveLength(1);
    const losers = res.filter((r) => r.status === 409);
    expect(losers).toHaveLength(9);
    expect(losers.every((r) => r.body.code === "MENTOR_BUSY")).toBe(true);
    expect(await getCollections(t.db).mentees.countDocuments({ status: "waiting" })).toBe(9);
  });

  it("idempotência: toque duplo com a mesma Idempotency-Key cria um só convite e devolve a mesma resposta", async () => {
    const { w, clients } = await setup("idem", { mentors: 1, mentees: 1 });
    const payload = body(w.mentees[0]!.doc._id, "s04", w.tables[0]!._id);
    const [a, b] = await Promise.all([0, 1].map(() => clients[0]!.post("/api/mentor/appointments", payload, { "idempotency-key": "toque-duplo" })));
    const c = await clients[0]!.post("/api/mentor/appointments", payload, { "idempotency-key": "toque-duplo" });
    for (const r of [a!, b!, c]) expect([200, 201, 409]).toContain(r.status); // 409 IDEMPOTENCY_IN_PROGRESS aceitável na corrida
    expect(c.status === 200 || c.status === 201).toBe(true);
    expect(await getCollections(t.db).appointments.countDocuments({})).toBe(1);
    if ((a!.status === 201 || a!.status === 200) && (b!.status === 201 || b!.status === 200)) {
      expect(a!.body.appointment.id).toBe(b!.body.appointment.id);
    }
  });
});
