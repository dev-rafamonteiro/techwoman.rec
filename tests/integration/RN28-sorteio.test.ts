import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN28 · sorteio na A10 (E62–E64): concorre quem respondeu a pesquisa (E09); cada sorteada fica gravada com ID,
 * nome, e-mail e celular e não volta ao sorteio até a lista ser limpa (E64).
 */
const api = await loadApi();

describe.skipIf(!api)("RN28 · sorteio entre quem respondeu a pesquisa", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;

  beforeAll(async () => {
    b = await bootApi(api!, "sorteio", { mentors: 1, mentees: 4 });
    c = getCollections(b.t.db);
    // participantes 0, 1 e 2 responderam a pesquisa; a 3 não
    for (const m of b.w.mentees.slice(0, 3)) {
      await c.feedbacks.insertOne({ _id: m.doc._id, eventId: m.doc.eventId, appointmentId: null, ratings: { event: 5, talk: 5, mentoring: 5 }, comment: null, createdAt: new Date() });
    }
  });
  afterAll(async () => b?.close());

  it("E62: concorrem só as que responderam; nenhuma sorteada ainda", async () => {
    const r = await b.admin.get("/api/admin/raffle");
    expect([r.status, r.body.eligible, r.body.draws]).toEqual([200, 3, []]);
  });

  it("E63: sorteia as três sem repetir, grava os dados e depois não há mais ninguém (409)", async () => {
    const answered = new Set(b.w.mentees.slice(0, 3).map((m) => String(m.doc._id)));
    const seen = new Set<string>();
    for (let left = 2; left >= 0; left--) {
      const r = await b.admin.post("/api/admin/raffle/draws", {});
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.eligible).toBe(left);
      const d = r.body.draw;
      expect(answered.has(d.menteeId)).toBe(true);
      expect(seen.has(d.menteeId)).toBe(false);
      seen.add(d.menteeId);
      const m = (await c.mentees.findOne({ _id: b.w.mentees.find((x) => String(x.doc._id) === d.menteeId)!.doc._id }))!;
      expect(d).toMatchObject({ name: m.name, email: m.email, phone: m.phone ?? null });
    }
    const none = await b.admin.post("/api/admin/raffle/draws", {});
    expect([none.status, none.body.code]).toEqual([409, "INVALID_STATE"]);
    const list = await b.admin.get("/api/admin/raffle");
    expect([list.body.eligible, list.body.draws.length]).toEqual([0, 3]);
    expect(await c.raffleDraws.countDocuments({})).toBe(3);
    expect(await c.auditLogs.countDocuments({ action: "raffle.draw" })).toBe(3);
  });

  it("E64: limpar apaga as sorteadas e todas voltam a concorrer", async () => {
    const r = await b.admin.req("DELETE", "/api/admin/raffle/draws");
    expect([r.status, r.body]).toEqual([200, { ok: true, cleared: 3 }]);
    const list = await b.admin.get("/api/admin/raffle");
    expect([list.body.eligible, list.body.draws]).toEqual([3, []]);
    expect(await c.auditLogs.findOne({ action: "raffle.clear" })).toMatchObject({ after: { cleared: 3 } });
    expect((await b.admin.post("/api/admin/raffle/draws", {})).status).toBe(201);
  });

  it("mentora e participante não acessam", async () => {
    expect((await b.mentor[0]!.get("/api/admin/raffle")).status).toBe(403);
    expect((await b.mentor[0]!.post("/api/admin/raffle/draws", {})).status).toBe(403);
    expect((await Client.asMentee(b.app, b.w.mentees[0]!.token).get("/api/admin/raffle")).status).toBe(401);
  });
});
