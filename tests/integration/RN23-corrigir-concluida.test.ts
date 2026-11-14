import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** RN23 · E39 `reopen`/`release`: super admin corrige uma mentoria concluída no mapa de mesas. */
const api = await loadApi();

describe.skipIf(!api)("RN23 · corrigir mentoria concluída", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;

  /** Convida, confirma e conclui. Cada participante fica num horário próprio. */
  const concluded = async (i: number) => {
    expect((await b.invite(0, i, i + 2, 0)).status).toBe(201);
    expect((await Client.asMentee(b.app, b.w.mentees[i]!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[i]!.doc._id, status: "confirmed" }))!;
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${a._id}`, { action: "finish" })).status).toBe(200);
    return a;
  };
  const mentee = (i: number) => c.mentees.findOne({ _id: b.w.mentees[i]!.doc._id });
  const url = (id: unknown) => `/api/admin/appointments/${id}`;

  beforeAll(async () => {
    b = await bootApi(api!, "rn23", { mentors: 1, mentees: 6, tables: 5 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => b?.close());

  it("admin e mentora não corrigem; super admin sim", async () => {
    const a = await concluded(0);
    const r = await b.admin.patch(url(a._id), { action: "reopen" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
    expect((await b.admin.patch(url(a._id), { action: "release" })).status).toBe(403);
    expect((await b.mentor[0]!.patch(url(a._id), { action: "reopen" })).status).toBe(403);
    expect((await c.appointments.findOne({ _id: a._id }))?.status).toBe("done");
  });

  it("reopen: volta para confirmada, sem aviso, com histórico e auditoria; pode concluir de novo", async () => {
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id, status: "done" }))!;
    const before = await c.outbox.countDocuments({ appointmentId: a._id });
    const r = await b.superAdmin.patch(url(a._id), { action: "reopen" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.appointment.status).toBe("confirmed");
    const doc = (await c.appointments.findOne({ _id: a._id }))!;
    expect(doc).toMatchObject({ status: "confirmed", slotLock: true, menteeLock: true });
    expect(doc.history.at(-1)).toMatchObject({ from: "done", to: "confirmed", reason: "reopened_by_super_admin" });
    expect((await mentee(0))?.status).toBe("confirmed");
    expect(await c.outbox.countDocuments({ appointmentId: a._id })).toBe(before);
    expect(await c.auditLogs.findOne({ action: "appointment.reopen", entityId: String(a._id) })).toBeTruthy();
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${a._id}`, { action: "finish" })).status).toBe(200);
  });

  it("release: mesa e horário livres, participante na fila com prioridade, sem aviso; a mesa aceita outra", async () => {
    const a = await concluded(1);
    const before = await c.outbox.countDocuments({ appointmentId: a._id });
    const r = await b.superAdmin.patch(url(a._id), { action: "release" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const doc = (await c.appointments.findOne({ _id: a._id }))!;
    expect(doc.status).toBe("cancelled");
    expect(doc.slotLock).toBeUndefined();
    expect(doc.menteeLock).toBeUndefined();
    expect(await mentee(1)).toMatchObject({ status: "waiting", priority: true, priorityReason: "cancelled_by_staff", currentAppointmentId: null });
    expect(await c.outbox.countDocuments({ appointmentId: a._id })).toBe(before);
    expect((await b.invite(0, 2, 3, 0)).status).toBe(201);
  });

  it("não compareceu e em andamento também podem ser corrigidos", async () => {
    const m = b.w.mentees[0]!.doc._id;
    const a = (await c.appointments.findOne({ menteeId: m, status: "done" }))!;
    await c.appointments.updateOne({ _id: a._id }, { $set: { status: "no_show" } });
    await c.mentees.updateOne({ _id: m }, { $set: { status: "no_show" } });
    expect((await b.superAdmin.patch(url(a._id), { action: "reopen" })).status).toBe(200);
    expect((await mentee(0))?.status).toBe("confirmed");
    await c.appointments.updateOne({ _id: a._id }, { $set: { status: "in_progress" } });
    expect((await b.superAdmin.patch(url(a._id), { action: "release" })).status).toBe(200);
    expect(await mentee(0)).toMatchObject({ status: "waiting", priority: true });
  });

  it("reabrir não compareceu com a mentora já em outra mentoria no horário: 409, sem mexer em nada", async () => {
    expect((await b.invite(0, 5, 7, 0)).status).toBe(201);
    expect((await Client.asMentee(b.app, b.w.mentees[5]!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[5]!.doc._id, status: "confirmed" }))!;
    expect((await b.superAdmin.patch(url(a._id), { action: "no_show" })).status).toBe(200);
    expect((await c.appointments.findOne({ _id: a._id }))!.slotLock).toBeUndefined();
    // outra mentoria da mesma mentora no horário que a falta liberou
    await c.appointments.insertOne({ ...a, _id: new (a._id.constructor as any)(), menteeId: new (a._id.constructor as any)(), tableId: new (a._id.constructor as any)(), status: "confirmed", slotLock: true } as never);
    const r = await b.superAdmin.patch(url(a._id), { action: "reopen" });
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.code).toBe("MENTOR_BUSY");
    expect((await c.appointments.findOne({ _id: a._id }))!.status).toBe("no_show");
  });

  it("só de mentoria concluída", async () => {
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[2]!.doc._id, status: "invited" }))!;
    const r = await b.superAdmin.patch(url(a._id), { action: "release" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("INVALID_STATE");
  });

  it("não reabre se a inscrição mudou depois da conclusão", async () => {
    const a = await concluded(3);
    await c.mentees.updateOne({ _id: b.w.mentees[3]!.doc._id }, { $set: { status: "cancelled" } });
    const r = await b.superAdmin.patch(url(a._id), { action: "reopen" });
    expect(r.status).toBe(409);
    expect((await c.appointments.findOne({ _id: a._id }))?.status).toBe("done");
  });

  it("participante com outra mentoria ativa: 409 MENTEE_TAKEN", async () => {
    const a = await concluded(4);
    // outra mentoria ativa dela, sem passar pela fila: é o caso que o índice único barra
    await c.appointments.insertOne({ ...a, _id: new (a._id.constructor as any)(), slotId: b.w.slotIds[9]!, status: "confirmed", slotLock: true, menteeLock: true } as never);
    const r = await b.superAdmin.patch(url(a._id), { action: "reopen" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("MENTEE_TAKEN");
  });
});
