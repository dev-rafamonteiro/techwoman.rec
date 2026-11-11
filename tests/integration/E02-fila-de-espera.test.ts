import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** E02 sem horário: só quando o evento não tem horário livre; entra na fila (waiting) com o e-mail de inscrição recebida. */
const api = await loadApi();

describe.skipIf(!api)("E02 · fila de espera quando os horários acabam", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const body = (over: Record<string, unknown> = {}) => ({
    name: "Maria Silva", email: `fila${seq}@y.test`, phone: `819${String(34567000 + seq++)}`, area: "dados",
    consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok", ...over,
  });
  let availability: string[];

  beforeAll(async () => {
    b = await bootApi(api!, "fila", { mentors: 2, mentees: 0 });
    c = getCollections(b.t.db);
    availability = (await c.users.findOne({ roles: "mentor" }))!.availability;
  }, 120_000);
  afterAll(async () => b?.close());

  it("com horário livre, sem escolher horário -> VALIDATION_ERROR (a fila não fura a escolha)", async () => {
    const r = await b.anon.post("/api/public/mentees", body());
    expect([r.status, r.body.code]).toEqual([422, "VALIDATION_ERROR"]);
    expect(await c.mentees.countDocuments({})).toBe(0);
  });

  it("só horário sem mentora (ou o contrário) -> 422", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ slotId: "s01" }));
    expect(r.status).toBe(422);
  });

  it("sem nenhum horário livre: 201 na fila, sem mentoria, e-mail de inscrição recebida", async () => {
    await c.users.updateMany({ roles: "mentor" }, { $set: { availability: [] } });
    const r = await b.anon.post("/api/public/mentees", body());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.appointment).toBeNull();
    expect(r.body.personalPath).toContain(r.body.token);
    const mentee = (await c.mentees.findOne({ emailNorm: `fila${seq - 1}@y.test` }))!;
    expect(mentee).toMatchObject({ status: "waiting", preferredPeriod: "any", currentAppointmentId: null });
    expect(await c.appointments.countDocuments({ menteeId: mentee._id })).toBe(0);
    expect((await c.outbox.find({ menteeId: mentee._id }).toArray()).map((o) => o.type)).toEqual(["registered"]);
    await c.users.updateMany({ roles: "mentor" }, { $set: { availability } });
  });
});
