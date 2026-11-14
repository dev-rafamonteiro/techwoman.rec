import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * E39 criar com `confirmNow` (A5, mesa livre): a participante sentou na mesa depois do início (a conversa anterior passou
 * da hora). O admin registra retroativamente: a mentoria nasce confirmada, sem convite. Mentora livre no horário inclui a
 * que teve participante que não compareceu ou mentoria cancelada.
 */
const api = await loadApi();
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

describe.skipIf(!api)("E39 · registro retroativo na mesa", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => String(b.w.mentees[i]!.doc._id);
  const create = (i: number, slotIdx: number, tableIdx: number, extra: Record<string, unknown> = {}) =>
    b.admin.post("/api/admin/appointments", {
      menteeId: mentee(i), mentorId: String(b.w.mentors[0]!._id), slotId: b.w.slotIds[slotIdx]!, tableId: String(b.w.tables[tableIdx]!._id), ignoreLeadTime: true, ...extra,
    });

  beforeAll(async () => {
    b = await bootApi(api!, "retro", { mentors: 1, mentees: 4 });
    c = getCollections(b.t.db);
    // 15 min depois do início do primeiro horário
    b.clock.now = min((await c.events.findOne({}))!.slots[0]!.startAt, 15);
  }, 120_000);
  afterAll(async () => b?.close());

  it("horário que já começou, sem confirmar na hora -> SLOT_UNAVAILABLE (o convite nasceria vencido)", async () => {
    const r = await create(0, 0, 0);
    expect(r.body.code, JSON.stringify(r.body)).toBe("SLOT_UNAVAILABLE");
    expect(await c.appointments.countDocuments({})).toBe(0);
    expect((await c.mentees.findOne({ _id: b.w.mentees[0]!.doc._id }))!.status).toBe("waiting");
  });

  it("com confirmNow: nasce confirmada, sem convite nem lembrete, e a auditoria marca o retroativo", async () => {
    const r = await create(0, 0, 0, { confirmNow: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.appointment.status).toBe("confirmed");
    const a = (await c.appointments.findOne({ _id: new (await import("mongodb")).ObjectId(r.body.appointment.id) }))!;
    expect(a).toMatchObject({ status: "confirmed", expiresAt: null, slotLock: true, menteeLock: true });
    expect(a.history.at(-1)).toMatchObject({ from: null, to: "confirmed", reason: "in_person" });
    expect(a.confirmedBy?.role).toBe("admin");
    expect(await c.mentees.findOne({ _id: a.menteeId })).toMatchObject({ status: "confirmed", currentAppointmentId: a._id });
    const types = (await c.outbox.find({ appointmentId: a._id }).toArray()).map((o) => o.type);
    expect(types).toContain("confirmed");
    expect(types).not.toContain("invite");
    expect(types).not.toContain("reminder");
    expect(await c.auditLogs.findOne({ action: "appointment.confirm_in_person", entityId: String(a._id), "after.retroactive": true })).toBeTruthy();
  });

  it("mentora cuja participante não compareceu fica livre no horário e recebe outra, retroativamente", async () => {
    const first = await create(1, 1, 1, { confirmNow: true });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    b.clock.now = min(b.clock.now, 30); // já dentro (ou depois) do segundo horário
    expect((await b.admin.patch(`/api/admin/appointments/${first.body.appointment.id}`, { action: "no_show" })).status).toBe(200);
    const r = await create(2, 1, 1, { confirmNow: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.appointment).toMatchObject({ status: "confirmed", mentor: { id: String(b.w.mentors[0]!._id) } });
  });

  it("mentoria cancelada: a mentora fica livre no horário", async () => {
    const first = await create(3, 2, 2, { confirmNow: true });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await b.admin.patch(`/api/admin/appointments/${first.body.appointment.id}`, { action: "cancel" })).status).toBe(200);
    // a participante cancelada volta à fila; ela mesma é registrada de novo, como se tivesse sentado depois
    const r = await create(3, 2, 2, { confirmNow: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  });
});
