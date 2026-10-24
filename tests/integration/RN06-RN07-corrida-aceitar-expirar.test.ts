import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb, type TestDb } from "../helpers/db.js";
import { seedWorld, appointmentDoc } from "../helpers/seed.js";
import { Client, loadApi, testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

const api = await loadApi();
const RACES = 25;

describe.skipIf(!api || !api.expireInvites)("RN06 x RN07: aceitar (E04) x expirar (worker) no mesmo instante: só um vence", () => {
  let t: TestDb;
  let app: FastifyInstance;
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it(`${RACES} corridas simultâneas: estado final sempre consistente`, async () => {
    t = await createTestDb("racexp");
    const w = await seedWorld(t.db, { mentors: RACES, tables: 20, mentees: RACES });
    const c = getCollections(t.db);
    const hash = await testPasswordHash();
    await c.users.updateMany({}, { $set: { passwordHash: hash } });

    // convites já criados direto no banco, todos com expiresAt = T. O relógio do app diz T-1s (aceitar ainda vale);
    // o worker roda com now = T (expirar vale). Só a condição de status no filtro decide quem ganha.
    const T = new Date("2026-11-14T12:00:00Z");
    const slot = (await c.events.findOne({}))!.slots[5]!;
    const now = new Date(T.getTime() - 1000);
    app = await api!.buildApp({ db: t.db, client: t.client, now: () => now, config: { turnstile: { mode: "test" }, rateLimit: false } });

    const appts = w.mentees.map((m, i) =>
      appointmentDoc({
        menteeId: m.doc._id, mentorId: w.mentors[i]!._id, tableId: w.tables[i % 20]!._id, slotId: slot.id,
        startAt: slot.startAt, endAt: slot.endAt, expiresAt: T,
      }),
    );
    // o convite do slot 6 em todas as mesas diferentes e mentoras diferentes -> sem conflito de índice
    appts.forEach((a, i) => (a.tableId = w.tables[i % 20]!._id));
    // 25 mentoras / 20 mesas: as 5 últimas usam slots diferentes para não colidir mesa
    appts.forEach((a, i) => { if (i >= 20) { const s2 = (i % 5) + 7; a.slotId = `s${String(s2).padStart(2, "0")}`; } });
    await c.appointments.insertMany(appts);
    for (const [i, m] of w.mentees.entries()) {
      await c.mentees.updateOne({ _id: m.doc._id }, { $set: { status: "invited", currentAppointmentId: appts[i]!._id } });
    }

    // aceitar de todas + varredura do worker disparados juntos
    const [accepts, sweep] = await Promise.all([
      Promise.all(w.mentees.map((m) => Client.asMentee(app, m.token).post("/api/public/me/actions", { action: "accept" }))),
      api!.expireInvites!(t.db, t.client, T),
    ]);

    let confirmed = 0;
    let expired = 0;
    for (const [i, a] of appts.entries()) {
      const appt = (await c.appointments.findOne({ _id: a._id }))!;
      const mentee = (await c.mentees.findOne({ _id: w.mentees[i]!.doc._id }))!;
      const res = accepts[i]!;
      const outbox = await t.db.collection("outbox").find({ appointmentId: a._id }).toArray();
      const types = outbox.map((o) => o.type);
      if (appt.status === "confirmed") {
        confirmed++;
        expect(res.status, "aceitar venceu: 200").toBe(200);
        expect(mentee.status).toBe("confirmed");
        expect(appt.slotLock && appt.menteeLock).toBe(true);
        expect(types).not.toContain("expired");
        expect(types).toContain("confirmed");
      } else {
        expired++;
        expect(appt.status).toBe("expired");
        expect(res.status, "expirar venceu: aceitar recebe 409").toBe(409);
        expect(["INVITE_EXPIRED", "INVALID_STATE", "INVITE_NOT_ACTIVE"]).toContain(res.body.code);
        expect(mentee.status).toBe("waiting");
        expect(mentee.priority).toBe(false); // RN07: sem prioridade
        expect(appt.slotLock).toBeUndefined();
        expect(appt.menteeLock).toBeUndefined();
        expect(types).toContain("expired");
        expect(types).not.toContain("confirmed");
      }
      // nunca duas transições: no máximo 1 entrada além da criação no histórico
      expect(appt.history.filter((h) => h.from === "invited")).toHaveLength(1);
    }
    expect(confirmed + expired).toBe(RACES);
    expect(sweep.expired).toBe(expired);
  });
});
