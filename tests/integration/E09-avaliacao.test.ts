import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * E09 · POST /public/me/feedback (P6, Concluída): notas de 1 a 5 para evento, palestra e mentoria e comentário
 * opcional; só com a participante `done`, uma vez. E03 devolve a avaliação enviada; a anonimização (E36) a apaga.
 */
const api = await loadApi();
const URL = "/api/public/me/feedback";
const OK = { event: 5, talk: 4, mentoring: 5, comment: "  Adorei a conversa!  " };

describe.skipIf(!api)("E09 · avaliação depois da mentoria concluída", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const asMentee = (i: number) => Client.asMentee(b.app, b.w.mentees[i]!.token);

  beforeAll(async () => {
    b = await bootApi(api!, "avaliacao", { mentors: 1, mentees: 2 });
    c = getCollections(b.t.db);
    // participante 0: convite -> aceite -> mentora conclui
    expect((await b.invite(0, 0, 4, 0)).status).toBe(201);
    expect((await asMentee(0).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const a = (await c.appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id }))!;
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${a._id}`, { action: "finish" })).status).toBe(200);
  });
  afterAll(async () => b?.close());

  it("antes de enviar, E03 traz feedback null", async () => {
    const r = await asMentee(0).get("/api/public/me");
    expect([r.status, r.body.mentee.status, r.body.feedback]).toEqual([200, "done", null]);
  });

  it("fora de `done` (aguardando) -> 409 INVALID_STATE, nada gravado", async () => {
    const r = await asMentee(1).post(URL, OK);
    expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
    expect(await c.feedbacks.countDocuments({})).toBe(0);
  });

  it("nota fora de 1..5, não inteira, faltando ou campo extra -> 422", async () => {
    for (const body of [{ ...OK, event: 0 }, { ...OK, talk: 6 }, { ...OK, mentoring: 3.5 }, { event: 5, talk: 5 }, { ...OK, extra: 1 }, { ...OK, comment: "x".repeat(1001) }]) {
      const r = await asMentee(0).post(URL, body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(422);
    }
    expect(await c.feedbacks.countDocuments({})).toBe(0);
  });

  it("concluída -> 200 com o estado de E03 já trazendo a avaliação; grava uma vez, comentário aparado", async () => {
    const r = await asMentee(0).post(URL, OK);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.feedback).toMatchObject({ ratings: { event: 5, talk: 4, mentoring: 5 }, comment: "Adorei a conversa!" });
    const m = b.w.mentees[0]!.doc;
    const doc = (await c.feedbacks.findOne({ _id: m._id }))!;
    const appt = (await c.appointments.findOne({ menteeId: m._id }))!;
    expect(doc).toMatchObject({ eventId: m.eventId, appointmentId: appt._id, comment: "Adorei a conversa!" });
    expect((await asMentee(0).get("/api/public/me")).body.feedback.ratings).toEqual({ event: 5, talk: 4, mentoring: 5 });
  });

  it("enviar de novo -> 409 INVALID_STATE e a primeira avaliação continua", async () => {
    const r = await asMentee(0).post(URL, { event: 1, talk: 1, mentoring: 1 });
    expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
    expect((await c.feedbacks.findOne({ _id: b.w.mentees[0]!.doc._id }))!.ratings.event).toBe(5);
  });

  it("sem comentário vira null", async () => {
    // reabre o cenário: apaga e envia só as notas
    await c.feedbacks.deleteMany({});
    const r = await asMentee(0).post(URL, { event: 3, talk: 3, mentoring: 3, comment: "   " });
    expect(r.status).toBe(200);
    expect(r.body.feedback.comment).toBeNull();
  });

  it("E49: admin vê totais, médias, distribuição e a resposta com mentora; mentora e participante não acessam", async () => {
    const r = await b.admin.get("/api/admin/feedback");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ total: 1, doneCount: 1 });
    expect(r.body.summary.event).toEqual({ average: 3, counts: [0, 0, 1, 0, 0] });
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ menteeName: b.w.mentees[0]!.doc.name, mentorName: b.w.mentors[0]!.name, ratings: { event: 3, talk: 3, mentoring: 3 }, comment: null });
    expect((await b.mentor[0]!.get("/api/admin/feedback")).status).toBe(403);
    expect((await asMentee(0).get("/api/admin/feedback")).status).toBe(401);
  });

  it("E36 anonymize apaga a avaliação", async () => {
    const id = b.w.mentees[0]!.doc._id;
    const r = await b.admin.patch(`/api/admin/mentees/${id}`, { action: "anonymize" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await c.feedbacks.countDocuments({ _id: id })).toBe(0);
    expect((await b.admin.get("/api/admin/feedback")).body).toMatchObject({ total: 0, items: [], summary: { talk: { average: null, counts: [0, 0, 0, 0, 0] } } });
  });
});
