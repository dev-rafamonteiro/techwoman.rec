import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

const api = await loadApi();

describe.skipIf(!api)("idempotência (Idempotency-Key, 10 min): E24, E04, E26", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "idem", { mentors: 1, mentees: 2 });
  });
  afterAll(async () => b?.close());

  it("E24: repetir a mesma chave devolve a mesma resposta e não cria segundo convite", async () => {
    const r1 = await b.invite(0, 0, 4, 0, { "idempotency-key": "e24-a" });
    const r2 = await b.invite(0, 0, 4, 0, { "idempotency-key": "e24-a" });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(r1.status);
    expect(r2.body).toEqual(r1.body);
    expect(await getCollections(b.t.db).appointments.countDocuments({})).toBe(1);
    expect(await b.t.db.collection("outbox").countDocuments({ type: "invite" })).toBeGreaterThan(0);
  });

  it("E24: mesma chave com corpo diferente não reaproveita a resposta (422/409)", async () => {
    const r = await b.invite(0, 1, 5, 1, { "idempotency-key": "e24-a" });
    expect([409, 422]).toContain(r.status);
    expect(await getCollections(b.t.db).appointments.countDocuments({})).toBe(1);
  });

  it("E24: sem chave, repetir o mesmo convite dá MENTEE_TAKEN (índice decide)", async () => {
    const r = await b.invite(0, 0, 4, 0);
    expect([r.status, r.body.code]).toEqual([409, "MENTEE_TAKEN"]);
  });

  it("E04: aceitar duas vezes com a mesma chave = uma confirmação, uma mensagem 'confirmed', um lembrete", async () => {
    const c = Client.asMentee(b.app, b.w.mentees[0]!.token);
    const [r1, r2] = await Promise.all([0, 1].map(() => c.post("/api/public/me/actions", { action: "accept" }, { "idempotency-key": "e04-a" })));
    const r3 = await c.post("/api/public/me/actions", { action: "accept" }, { "idempotency-key": "e04-a" });
    expect(r1!.status === 200 || r2!.status === 200).toBe(true);
    expect(r3.status).toBe(200);
    expect(r3.body.appointment.status).toBe("confirmed");
    const outbox = await b.t.db.collection("outbox").find({ type: { $in: ["confirmed", "reminder"] } }).toArray();
    const by = (t: string) => outbox.filter((o) => o.type === t && o.channel === "email").length;
    expect(by("confirmed")).toBe(1);
    expect(new Set(outbox.map((o) => o.dedupeKey)).size).toBe(outbox.length);
  });

  it("E04 sem chave: aceitar de novo um convite já confirmado -> 409 INVALID_STATE/INVITE_NOT_ACTIVE (não duplica efeito)", async () => {
    const c = Client.asMentee(b.app, b.w.mentees[0]!.token);
    const r = await c.post("/api/public/me/actions", { action: "accept" });
    expect(r.status).toBe(409);
    expect(["INVALID_STATE", "INVITE_NOT_ACTIVE"]).toContain(r.body.code);
  });

  it("E26: concluir duas vezes com a mesma chave = uma transição", async () => {
    const { appointments } = getCollections(b.t.db);
    const a = (await appointments.findOne({ status: "confirmed" }))!;
    const url = `/api/mentor/appointments/${a._id}`;
    const r1 = await b.mentor[0]!.patch(url, { action: "finish" }, { "idempotency-key": "e26-a" });
    const r2 = await b.mentor[0]!.patch(url, { action: "finish" }, { "idempotency-key": "e26-a" });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    const doc = (await appointments.findOne({ _id: a._id }))!;
    expect(doc.status).toBe("done");
    expect(doc.history.filter((h) => h.to === "done")).toHaveLength(1);
    expect(doc.menteeLock).toBeUndefined();
    expect(doc.slotLock).toBe(true);
  });

  it("E26: sem chave, concluir de novo -> 409 INVALID_STATE", async () => {
    const a = (await getCollections(b.t.db).appointments.findOne({ status: "done" }))!;
    const r = await b.mentor[0]!.patch(`/api/mentor/appointments/${a._id}`, { action: "finish" });
    expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
  });
});
