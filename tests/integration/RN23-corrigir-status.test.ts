import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN23 · E39 `correct_done`/`correct_no_show`: depois do evento o super admin corrige o resultado no mapa de mesas
 * (não compareceu -> concluída e concluída -> não compareceu), sem aviso nem pesquisa; a avaliação fica, com a
 * observação em A10 (E49 `noShow`).
 */
const api = await loadApi();

describe.skipIf(!api)("RN23 · corrigir status da mentoria (concluída × não compareceu)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;

  /** Convida e confirma; cada participante num horário próprio. */
  const confirmed = async (i: number) => {
    expect((await b.invite(0, i, i + 2, 0)).status).toBe(201);
    expect((await Client.asMentee(b.app, b.w.mentees[i]!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    return (await c.appointments.findOne({ menteeId: b.w.mentees[i]!.doc._id, status: "confirmed" }))!;
  };
  const mentee = (i: number) => c.mentees.findOne({ _id: b.w.mentees[i]!.doc._id });
  const url = (id: unknown) => `/api/admin/appointments/${id}`;
  const feedbackRequests = (id: unknown) => c.outbox.countDocuments({ appointmentId: id as never, type: "feedback_request" });

  beforeAll(async () => {
    b = await bootApi(api!, "rn23-status", { mentors: 1, mentees: 4, tables: 5 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => b?.close());

  it("só super admin corrige", async () => {
    const a = await confirmed(0);
    expect((await b.admin.patch(url(a._id), { action: "correct_done" })).status).toBe(403);
    expect((await b.mentor[0]!.patch(url(a._id), { action: "correct_done" })).status).toBe(403);
    expect((await c.appointments.findOne({ _id: a._id }))?.status).toBe("confirmed");
  });

  it("não compareceu -> concluída: volta a ocupar a mesa, participante atendida, sem pesquisa, com histórico e auditoria", async () => {
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id }))!;
    expect((await b.admin.patch(url(a._id), { action: "no_show" })).status).toBe(200);
    const r = await b.superAdmin.patch(url(a._id), { action: "correct_done" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const doc = (await c.appointments.findOne({ _id: a._id }))!;
    expect(doc).toMatchObject({ status: "done", slotLock: true });
    expect(doc.history.at(-1)).toMatchObject({ from: "no_show", to: "done", reason: "corrected_by_super_admin" });
    expect((await mentee(0))?.status).toBe("done");
    expect(await feedbackRequests(a._id)).toBe(0);
    expect(await c.auditLogs.findOne({ action: "appointment.correct_done", entityId: String(a._id) })).toBeTruthy();
  });

  it("confirmada -> concluída pelo super admin, também sem pesquisa", async () => {
    const a = await confirmed(1);
    expect((await b.superAdmin.patch(url(a._id), { action: "correct_done" })).status).toBe(200);
    expect((await mentee(1))?.status).toBe("done");
    expect(await feedbackRequests(a._id)).toBe(0);
  });

  it("concluída -> não compareceu: libera a mesa; a avaliação fica e E49 marca noShow", async () => {
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[1]!.doc._id }))!;
    const m = (await mentee(1))!;
    await c.feedbacks.insertOne({ _id: m._id, eventId: m.eventId, appointmentId: a._id, ratings: { event: 4, talk: 4, mentoring: 4 }, comment: null, createdAt: new Date() });
    const r = await b.superAdmin.patch(url(a._id), { action: "correct_no_show" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const doc = (await c.appointments.findOne({ _id: a._id }))!;
    expect(doc.status).toBe("no_show");
    expect(doc.slotLock).toBeUndefined();
    expect((await mentee(1))?.status).toBe("no_show");
    expect(await c.feedbacks.countDocuments({ _id: m._id })).toBe(1);
    const fb = await b.admin.get("/api/admin/feedback");
    expect(fb.body.items.find((x: { menteeId: string }) => x.menteeId === String(m._id))).toMatchObject({ noShow: true });
    // continua no mapa, para corrigir de novo
    const map = await b.admin.get("/api/admin/schedule");
    expect(map.body.appointments.find((x: { id: string }) => x.id === String(a._id))?.status).toBe("no_show");
  });

  it("estados inválidos -> 409 INVALID_STATE", async () => {
    const done = (await c.appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id }))!;
    expect((await b.superAdmin.patch(url(done._id), { action: "correct_done" })).body.code).toBe("INVALID_STATE");
    const conf = await confirmed(2);
    expect((await b.superAdmin.patch(url(conf._id), { action: "correct_no_show" })).body.code).toBe("INVALID_STATE");
  });
});
