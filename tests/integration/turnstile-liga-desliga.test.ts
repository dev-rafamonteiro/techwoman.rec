import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { booking } from "../helpers/booking.js";
import { getCollections } from "../../src/db/collections.js";

/** Turnstile da inscrição (E02) liga/desliga pelo super admin no A7 (E41); E01 avisa P4. */
const api = await loadApi();

describe.skipIf(!api)("Turnstile liga/desliga (E01, E02, E41)", () => {
  let b: Booted;
  let seq = 0;
  const body = (over: Record<string, unknown> = {}) => ({
    name: "Maria Silva", email: `ts${seq}@y.test`, phone: `819${String(23456000 + seq++)}`, area: "dados", ...booking(b.w.mentors[0]!._id),
    consent: { accepted: true, version: "2026-10-v1" }, ...over,
  });
  const setTurnstile = async (on: boolean) => {
    const { event: cfg } = (await b.superAdmin.get("/api/admin/event")).body;
    const { id: _id, slots: _slots, ...put } = cfg;
    return b.superAdmin.put("/api/admin/event", { ...put, turnstileEnabled: on });
  };

  beforeAll(async () => {
    b = await bootApi(api!, "turnstile", { mentors: 1, mentees: 0 });
  }, 120_000);
  afterAll(async () => b?.close());

  it("evento antigo, sem o campo: ligado (E01 e E41) e E02 sem token -> 403", async () => {
    await getCollections(b.t.db).events.updateMany({}, { $unset: { turnstileEnabled: "" } });
    expect((await b.anon.get("/api/public/event")).body.turnstileEnabled).toBe(true);
    expect((await b.superAdmin.get("/api/admin/event")).body.event.turnstileEnabled).toBe(true);
    const r = await b.anon.post("/api/public/mentees", body());
    expect([r.status, r.body.code]).toEqual([403, "TURNSTILE_FAILED"]);
  });

  it("A7 sem o campo (aba antiga) salva e não mexe no Turnstile", async () => {
    const { event: cfg } = (await b.superAdmin.get("/api/admin/event")).body;
    const { id: _id, slots: _slots, turnstileEnabled: _t, ...put } = cfg;
    expect((await b.superAdmin.put("/api/admin/event", put)).status).toBe(200);
    expect((await b.anon.get("/api/public/event")).body.turnstileEnabled).toBe(true);
  });

  it("desligado: E01 avisa e E02 aceita sem token; a auditoria registra a troca", async () => {
    const u = await setTurnstile(false);
    expect([u.status, u.body.event.turnstileEnabled]).toEqual([200, false]);
    expect((await b.anon.get("/api/public/event")).body.turnstileEnabled).toBe(false);
    const r = await b.anon.post("/api/public/mentees", body());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const audit = await getCollections(b.t.db).auditLogs.findOne({ action: "event.update" }, { sort: { _id: -1 } });
    expect(audit).toMatchObject({ before: { turnstileEnabled: true }, after: { turnstileEnabled: false } });
  });

  it("ligado de novo: token inválido -> 403, válido -> 201", async () => {
    expect((await setTurnstile(true)).status).toBe(200);
    const bad = await b.anon.post("/api/public/mentees", body({ turnstileToken: "invalido" }));
    expect([bad.status, bad.body.code]).toEqual([403, "TURNSTILE_FAILED"]);
    const ok = await b.anon.post("/api/public/mentees", body({ turnstileToken: "test-ok" }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });
});
