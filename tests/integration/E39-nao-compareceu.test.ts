import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * E39 no A5: a equipe registra a falta a qualquer hora (a regra dos 10 min é só da mentora, E26).
 * "Mentora não compareceu" sem troca: a mentoria é cancelada, a participante volta à fila com prioridade e a falta vai para a auditoria.
 */
const api = await loadApi();

describe.skipIf(!api)("E39 · não compareceu pela equipe", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const register = async (slotId: string) => {
    const r = await b.anon.post("/api/public/mentees", {
      name: "Maria Silva", email: `falta${seq}@y.test`, phone: `819${String(45679000 + seq++)}`, area: "dados", slotId, mentorId: String(b.w.mentors[0]!._id),
      consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return (await c.appointments.findOne({ menteeId: (await c.mentees.findOne({ emailNorm: `falta${seq - 1}@y.test` }))!._id, status: "confirmed" }))!;
  };

  beforeAll(async () => {
    b = await bootApi(api!, "falta", { mentors: 1, mentees: 0 });
    c = getCollections(b.t.db);
    await c.users.updateMany({ roles: "mentor" }, { $set: { areas: ["dados"] } });
  }, 120_000);
  afterAll(async () => b?.close());

  it("participante não compareceu: admin marca antes do início", async () => {
    const a = await register("s03");
    const r = await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "no_show" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.appointment.status).toBe("no_show");
    expect((await c.mentees.findOne({ _id: a.menteeId }))!.status).toBe("no_show");
  });

  it("a mentora, antes de início + 10 min -> TOO_EARLY", async () => {
    const a = await register("s04");
    const r = await b.mentor[0]!.patch(`/api/mentor/appointments/${a._id}`, { action: "no_show" });
    expect(r.body.code).toBe("TOO_EARLY");
  });

  it("mentora não compareceu: participante volta à fila com prioridade e a falta fica na auditoria", async () => {
    const a = await register("s05");
    const r = await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "cancel", mentorNoShow: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = (await c.appointments.findOne({ _id: a._id }))!;
    expect(after.status).toBe("cancelled");
    expect(after.history.at(-1)?.reason).toBe("mentor_no_show");
    expect(await c.mentees.findOne({ _id: a.menteeId })).toMatchObject({ status: "waiting", priority: true });
    expect(await c.auditLogs.findOne({ action: "mentor.no_show", entityId: String(b.w.mentors[0]!._id) })).toBeTruthy();
  });
});
