import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** RN24 · inscrição já com horário, mentora e mesa automática, numa transação só (E02, E58, E59). */
const api = await loadApi();

describe.skipIf(!api)("RN24 inscrição com agendamento", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const m = (i: number) => b.w.mentors[i]!;
  const body = (slotId: string, mentorId: unknown, over: Record<string, unknown> = {}) => ({
    name: "Maria Silva", email: `p${seq++}@y.test`, phone: "81912345678", area: "dados", slotId, mentorId: String(mentorId),
    consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok", ...over,
  });
  const register = (slotId: string, mentorId: unknown, over?: Record<string, unknown>) => b.anon.post("/api/public/mentees", body(slotId, mentorId, over));
  const reset = async () => {
    await Promise.all([c.appointments.deleteMany({}), c.mentees.deleteMany({}), c.outbox.deleteMany({})]);
    await c.users.updateMany({ roles: "mentor" }, { $set: { status: "active", areas: ["dados"] } });
  };

  beforeAll(async () => {
    b = await bootApi(api!, "rn24", { mentors: 18, mentees: 0 });
    c = getCollections(b.t.db);
    await c.events.updateOne({}, { $set: { registrationOpen: true } });
  }, 120_000);
  afterAll(async () => b?.close());

  it("confirma na hora: mentoria, período calculado, só o e-mail de confirmação e nenhuma entrada na fila", async () => {
    await reset();
    const r = await register("s02", m(0)._id);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.appointment.mentorName).toBe(m(0).name);
    expect(r.body.appointment.tableLabel).toMatch(/Mesa/);
    const mentee = (await c.mentees.findOne({ emailNorm: `p${seq - 1}@y.test` }))!;
    const appt = (await c.appointments.findOne({ menteeId: mentee._id }))!;
    expect(mentee).toMatchObject({ status: "confirmed", preferredPeriod: "morning", currentAppointmentId: appt._id });
    expect(appt).toMatchObject({ status: "confirmed", slotId: "s02", mentorId: m(0)._id });
    const types = (await c.outbox.find({ menteeId: mentee._id }).toArray()).map((o) => o.type);
    expect(types).toContain("confirmed");
    expect(types).not.toContain("registered");
    expect((await b.mentor[0]!.get("/api/mentor/queue")).body.items).toHaveLength(0);
  });

  it("avisa a mentora por e-mail, sem token da participante; não avisa se ela já cancelou", async () => {
    await reset();
    const r = await register("s02", m(0)._id);
    const appt = (await c.appointments.findOne({ slotId: "s02" }))!;
    expect(await c.outbox.findOne({ type: "mentor_booked" as never })).toMatchObject({ to: m(0).email, userId: m(0)._id, menteeId: null, appointmentId: appt._id, dedupeKey: `mentor_booked:${appt._id}:email` });
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: "https://techwoman.test" } });
    const mail = n.sent.find((s: any) => s.type === "mentor_booked");
    expect(mail.to).toBe(m(0).email);
    expect(mail.subject).toMatch(/^Nova mentoria: Maria Silva às /);
    expect(mail.text).toContain(r.body.appointment.tableLabel);
    expect(mail.text).toContain("https://techwoman.test/entrar");
    expect(mail.text + mail.html).not.toMatch(/\?t=|\/l\//);

    await reset();
    await register("s02", m(0)._id);
    await c.appointments.updateMany({}, { $set: { status: "cancelled" }, $unset: { slotLock: "", menteeLock: "" } });
    const later = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: later, now: b.clock.now, config: { publicBaseUrl: "https://techwoman.test" } });
    expect(later.sent.filter((s: any) => s.type === "mentor_booked")).toHaveLength(0);
    expect(await c.outbox.findOne({ type: "mentor_booked" as never })).toMatchObject({ status: "skipped", lastError: "mentoria não está mais confirmada" });
  });

  it("mesma mentora, horário seguinte: fica na mesma mesa", async () => {
    await reset();
    const first = await register("s03", m(0)._id);
    const second = await register("s04", m(0)._id);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.appointment.tableLabel).toBe(first.body.appointment.tableLabel);
  });

  it("outra mentora no horário vizinho não toma a mesa da primeira", async () => {
    await reset();
    const first = await register("s03", m(0)._id);
    const other = await register("s04", m(1)._id);
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    expect(other.body.appointment.tableLabel).not.toBe(first.body.appointment.tableLabel);
    const back = await register("s04", m(0)._id);
    expect(back.body.appointment.tableLabel).toBe(first.body.appointment.tableLabel);
  });

  it("corrida pela mesma mentora e horário: uma confirma, a outra 409 sem deixar inscrição", async () => {
    await reset();
    const rs = await Promise.all(Array.from({ length: 6 }, () => register("s05", m(0)._id)));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    expect(rs.find((r) => r.status === 409)!.body.code).toBe("SLOT_UNAVAILABLE");
    expect(await c.appointments.countDocuments({ slotId: "s05", slotLock: true })).toBe(1);
    expect(await c.mentees.countDocuments({})).toBe(1);
  });

  it("corrida de mentoras diferentes no mesmo horário: todas confirmam, cada uma numa mesa", async () => {
    await reset();
    const rs = await Promise.all(b.w.mentors.map((mt) => register("s06", mt._id)));
    expect(rs.map((r) => r.status), JSON.stringify(rs.map((r) => r.body))).toEqual(rs.map(() => 201));
    const at = await c.appointments.find({ slotId: "s06", slotLock: true }).toArray();
    expect(new Set(at.map((a) => String(a.tableId))).size).toBe(b.w.mentors.length);
  });

  it("mentora fora da trilha, fora da disponibilidade ou inexistente: 409 e nada gravado", async () => {
    await reset();
    await c.users.updateOne({ _id: m(1)._id }, { $set: { areas: ["qualidade"] } });
    await c.users.updateOne({ _id: m(2)._id }, { $set: { availability: ["s01"] } });
    for (const id of [m(1)._id, m(2)._id, new ObjectId(), "nao-e-id"]) {
      const r = await register("s07", id);
      expect([r.status, r.body.code], JSON.stringify(r.body)).toEqual([409, "SLOT_UNAVAILABLE"]);
    }
    expect(await c.mentees.countDocuments({})).toBe(0);
    await c.users.updateOne({ _id: m(2)._id }, { $set: { availability: m(2).availability } });
  });

  it("horário inexistente: 409", async () => {
    await reset();
    const r = await register("s99", m(0)._id);
    expect([r.status, r.body.code]).toEqual([409, "SLOT_UNAVAILABLE"]);
  });

  it("E58: vagas = min(mentoras livres da trilha, mesas livres) e some o horário sem mentora", async () => {
    await reset();
    const before = await b.anon.get("/api/public/slots?area=dados");
    const s = (id: string, items = before.body.items) => items.find((i: { slotId: string }) => i.slotId === id);
    const tables = await c.tables.countDocuments({ active: true });
    expect(s("s08").available).toBe(Math.min(18, tables));
    expect(s("s08").period).toMatch(/morning|early_afternoon|late_afternoon/);
    await register("s08", m(0)._id);
    expect(s("s08", (await b.anon.get("/api/public/slots?area=dados")).body.items).available).toBe(Math.min(17, tables - 1));
    expect((await b.anon.get("/api/public/slots?area=qualidade")).body.items).toEqual([]);
  });

  it("E59: no máximo 5, só livres no horário e da trilha, sem dados de contato", async () => {
    await reset();
    await register("s09", m(0)._id);
    await c.users.updateOne({ _id: m(1)._id }, { $set: { areas: ["qualidade"] } });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const r = await b.anon.get("/api/public/slots/s09/mentors?area=dados");
      expect(r.status).toBe(200);
      expect(r.body.items.length).toBe(5);
      for (const item of r.body.items) {
        seen.add(item.id);
        expect(Object.keys(item).sort()).toEqual(["bio", "id", "linkedin", "name", "photoUrl"]);
      }
    }
    expect(seen.has(String(m(0)._id))).toBe(false);
    expect(seen.has(String(m(1)._id))).toBe(false);
    expect(seen.size).toBeGreaterThan(5);
  });
});
