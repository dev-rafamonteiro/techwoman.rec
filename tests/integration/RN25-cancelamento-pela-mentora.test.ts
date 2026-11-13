import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatTimeBR } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN25 · Cancelamento pela mentora liga/desliga pelo admin (E61, A1). Desligado (evento sem o campo, como em
 * produção): E26 `cancel` -> 403 e E60 grava um `mentor_cancel_request` por administradora ativa, com o motivo,
 * que o worker renderiza no layout 13. Ligado: E26 cancela como antes.
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const TYPE = "mentor_cancel_request" as never;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN25 · cancelamento pela mentora (E26, E60, E61)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!;
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const invite = async (mi: number, si: number) => {
    const r = await b.invite(0, mi, si, mi);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return apptOf(mi);
  };

  beforeAll(async () => {
    b = await bootApi(api!, "rn25-cancelamento", { mentors: 1, mentees: 4 });
    c = getCollections(b.t.db);
    // evento antigo, sem o campo: desligado
    await c.events.updateMany({}, { $unset: { mentorCancelEnabled: "" } });
  }, 120_000);
  afterAll(async () => b?.close());

  it("desligado por padrão: E30 e E25 avisam; E26 cancel -> 403 e a mentoria segue", async () => {
    expect((await b.admin.get("/api/admin/dashboard")).body.mentorCancelEnabled).toBe(false);
    const appt = await invite(0, 2);
    expect((await b.mentor[0]!.get("/api/mentor/appointments")).body.mentorCancelEnabled).toBe(false);
    const r = await b.mentor[0]!.patch(`/api/mentor/appointments/${appt._id}`, { action: "cancel" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
    expect((await apptOf(0)).status).toBe("invited");
  });

  it("E60: um e-mail por administradora ativa, com o motivo; pedido repetido gera outro; o worker usa o layout 13", async () => {
    const appt = await apptOf(0);
    // administradora desativada não recebe
    await c.users.insertOne({ ...(await c.users.findOne({ email: "admin@techwoman.test" }))!, _id: new (appt._id.constructor as any)(), email: "inativa@techwoman.test", status: "disabled" });
    const r = await b.mentor[0]!.post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "Tive uma emergência." });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ notified: 2 });
    const items = await c.outbox.find({ type: TYPE }).toArray();
    expect(items.map((i) => i.to).sort()).toEqual(["admin@techwoman.test", "super@techwoman.test"]);
    expect(items[0]).toMatchObject({ menteeId: null, appointmentId: appt._id, payload: { justification: "Tive uma emergência." } });
    expect(new Set(items.map((i) => i.dedupeKey)).size).toBe(2);
    expect(await c.auditLogs.countDocuments({ action: "appointment.cancel_request" })).toBe(1);

    expect((await b.mentor[0]!.post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "De novo." })).status).toBe(200);
    expect(await c.outbox.countDocuments({ type: TYPE })).toBe(4);

    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    const mail = n.sent.find((s: any) => s.type === "mentor_cancel_request" && s.to === "admin@techwoman.test") as any;
    const horario = formatTimeBR(appt.startAt, "America/Recife");
    expect(mail.subject).toBe(`${b.w.mentors[0]!.name} pede para cancelar a mentoria das ${horario}`);
    expect(mail.text).toContain(`${b.w.mentors[0]!.name} quer cancelar a mentoria das ${horario} com ${mentee(0).doc.name}`);
    expect(mail.text).toContain("Motivo: Tive uma emergência.");
    expect(mail.text).toContain(`${BASE}/admin/mapa`);
    expect(mail.text).toContain("é administradora do evento");
  });

  it("E60: motivo vazio -> 422; mentoria de outra mentora ou encerrada não aceita pedido; participante não pede", async () => {
    const appt = await apptOf(0);
    expect((await b.mentor[0]!.post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "  " })).status).toBe(422);
    expect((await b.admin.post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "x" })).status).toBe(403);
    expect((await Client.asMentee(b.app, mentee(0).token).post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "x" })).status).toBe(401);
    await c.appointments.updateOne({ _id: appt._id }, { $set: { status: "done" } });
    expect((await b.mentor[0]!.post(`/api/mentor/appointments/${appt._id}/cancel-request`, { reason: "x" })).status).toBe(409);
  });

  it("E61: só admin ou super admin liga; ligado, E26 cancela como antes", async () => {
    expect((await b.mentor[0]!.put("/api/admin/mentor-cancel", { enabled: true })).status).toBe(403);
    const r = await b.admin.put("/api/admin/mentor-cancel", { enabled: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ mentorCancelEnabled: true });
    expect((await b.mentor[0]!.get("/api/mentor/appointments")).body.mentorCancelEnabled).toBe(true);
    expect(await c.auditLogs.countDocuments({ action: "event.mentor_cancel" })).toBe(1);
    const appt = await invite(1, 3);
    const cancel = await b.mentor[0]!.patch(`/api/mentor/appointments/${appt._id}`, { action: "cancel" });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    expect((await apptOf(1)).status).toBe("cancelled");
    expect((await b.superAdmin.put("/api/admin/mentor-cancel", { enabled: false })).status).toBe(200);
    expect((await b.admin.get("/api/admin/dashboard")).body.mentorCancelEnabled).toBe(false);
  });
});
