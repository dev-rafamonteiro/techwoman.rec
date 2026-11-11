import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * E39 change_mentor (A5): a mentora não apareceu, a host troca por outra livre no mesmo horário e mesa.
 * Participante recebe "sua mentoria mudou", a nova mentora o aviso de nova mentoria; a falta vai para a auditoria.
 */
const api = await loadApi();

describe.skipIf(!api)("E39 · trocar a mentora", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const m = (i: number) => b.w.mentors[i]!;
  const register = async (mentorId: unknown, slotId = "s03") => {
    const r = await b.anon.post("/api/public/mentees", {
      name: "Maria Silva", email: `troca${seq}@y.test`, phone: `819${String(45678000 + seq++)}`, area: "dados", slotId, mentorId: String(mentorId),
      consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return (await c.appointments.findOne({ menteeId: (await c.mentees.findOne({ emailNorm: `troca${seq - 1}@y.test` }))!._id, status: "confirmed" }))!;
  };

  beforeAll(async () => {
    b = await bootApi(api!, "troca", { mentors: 3, mentees: 0 });
    c = getCollections(b.t.db);
    await c.users.updateMany({ roles: "mentor" }, { $set: { areas: ["dados"] } });
  }, 120_000);
  afterAll(async () => b?.close());

  it("troca na mesma mesa e horário, avisa as duas e registra a falta da original", async () => {
    const old = await register(m(0)._id);
    await c.outbox.deleteMany({});
    const r = await b.admin.patch(`/api/admin/appointments/${old._id}`, { action: "change_mentor", mentorId: String(m(1)._id), mentorNoShow: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.appointment).toMatchObject({ status: "confirmed", slotId: old.slotId, table: { id: String(old.tableId) }, mentor: { id: String(m(1)._id) } });

    const prev = (await c.appointments.findOne({ _id: old._id }))!;
    expect(prev.status).toBe("cancelled");
    expect(prev.history.at(-1)?.reason).toBe("mentor_no_show");
    const mentee = (await c.mentees.findOne({ _id: old.menteeId }))!;
    expect(mentee).toMatchObject({ status: "confirmed", priority: false });
    expect(String(mentee.currentAppointmentId)).toBe(r.body.appointment.id);

    const types = (await c.outbox.find({}).toArray()).map((o) => `${o.type}:${o.menteeId ? "mentee" : String(o.userId)}`);
    expect(types).toContain("moved:mentee");
    expect(types).toContain(`mentor_booked:${m(1)._id}`);
    const audit = await c.auditLogs.findOne({ action: "mentor.no_show", entityId: String(m(0)._id) });
    expect(audit).toBeTruthy();
  });

  it("sem marcar a falta: motivo mentor_changed e nada de mentor.no_show", async () => {
    const old = await register(m(0)._id, "s04");
    const before = await c.auditLogs.countDocuments({ action: "mentor.no_show" });
    const r = await b.admin.patch(`/api/admin/appointments/${old._id}`, { action: "change_mentor", mentorId: String(m(2)._id) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: old._id }))!.history.at(-1)?.reason).toBe("mentor_changed");
    expect(await c.auditLogs.countDocuments({ action: "mentor.no_show" })).toBe(before);
  });

  it("mentora ocupada no horário -> 409 MENTOR_BUSY; a mesma mentora -> 422", async () => {
    const a = await register(m(0)._id, "s05");
    await register(m(1)._id, "s05");
    const busy = await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "change_mentor", mentorId: String(m(1)._id) });
    expect([busy.status, busy.body.code]).toEqual([409, "MENTOR_BUSY"]);
    const same = await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "change_mentor", mentorId: String(m(0)._id) });
    expect(same.status).toBe(422);
    // nada mudou: a mentoria original segue confirmada
    expect((await c.appointments.findOne({ _id: a._id }))!.status).toBe("confirmed");
  });
});
