import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * PLAN, Notificações: inscrição cancelada pela própria participante (E04 `cancel`, ou recusa com "Não tenho mais
 * interesse") -> `registration_cancelled` por e-mail (layout 7) e WhatsApp (texto fixo da UI-SPEC), enfileirado na
 * mesma transação, dedupe `registration_cancelled:<menteeId>:<version>`. Cancelamento pela mentora/admin não dispara.
 * WhatsApp ligado só na config de teste (o worker usa o MemoryNotifier, nada sai de verdade).
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const WORKER_CONFIG = { whatsappEnabled: true, publicBaseUrl: BASE };
const SUBJECT = "Sua inscrição na mentoria do Tech Woman foi cancelada";
const waText = (nome: string) =>
  `Tudo certo, ${nome}. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu. Se havia um horário marcado, ele foi liberado. Se mudar de ideia, é só se inscrever de novo: ${BASE}/mentoria/inscricao`;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("E04 · inscrição cancelada pela participante (registration_cancelled)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!;
  const asMentee = (i: number) => Client.asMentee(b.app, mentee(i).token);
  const items = (i: number) => c.outbox.find({ type: "registration_cancelled" as never, menteeId: mentee(i).doc._id }).sort({ channel: 1 }).toArray();
  const fresh = async (i: number) => (await c.mentees.findOne({ _id: mentee(i).doc._id }))!;
  const run = async () => {
    const n = new api!.MemoryNotifier!();
    const res = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: WORKER_CONFIG });
    return { n, res };
  };
  /** E-mail + WhatsApp, os dois com a dedupeKey da version pós-cancelamento. */
  const expectEnqueued = async (i: number, appointmentId: unknown) => {
    const m = await fresh(i);
    expect(m.status).toBe("cancelled");
    const out = await items(i);
    expect(out.map((o) => o.channel)).toEqual(["email", "whatsapp"]);
    for (const o of out) {
      expect(o).toMatchObject({ status: "pending", menteeId: m._id, appointmentId, dedupeKey: `registration_cancelled:${m._id}:${m.version}:${o.channel}` });
      expect(o.to).toBe(o.channel === "email" ? m.email : m.phone);
    }
  };

  beforeAll(async () => {
    b = await bootApi(api!, "inscricao-cancelada", { mentors: 2, mentees: 8, env: { WHATSAPP_ENABLED: "true" } });
    c = getCollections(b.t.db);
  });
  afterAll(async () => b?.close());

  it("aguardando (waiting) -> cancel: enfileira e-mail + WhatsApp na mesma operação, appointmentId null", async () => {
    const before = (await fresh(0)).version;
    const r = await asMentee(0).post("/api/public/me/actions", { action: "cancel" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await fresh(0)).version).toBe(before + 1);
    await expectEnqueued(0, null);
  });

  it("confirmada -> cancel (transição mentee_cancel): enfileira e-mail + WhatsApp referenciando a mentoria", async () => {
    expect((await b.invite(0, 1, 6, 0)).status).toBe(201);
    expect((await asMentee(1).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const appt = (await c.appointments.findOne({ menteeId: mentee(1).doc._id }))!;
    const r = await asMentee(1).post("/api/public/me/actions", { action: "cancel" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
    await expectEnqueued(1, appt._id);
    // a mentoria cancelada pela participante não gera o `cancelled` (aviso de cancelamento pela mentora)
    expect(await c.outbox.countDocuments({ type: "cancelled", menteeId: mentee(1).doc._id })).toBe(0);
  });

  it("convite -> recusa 'Não tenho mais interesse' (decline_no_interest): enfileira e-mail + WhatsApp", async () => {
    expect((await b.invite(1, 2, 7, 1)).status).toBe(201);
    const appt = (await c.appointments.findOne({ menteeId: mentee(2).doc._id }))!;
    const r = await asMentee(2).post("/api/public/me/actions", { action: "decline", reason: "no_interest" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("declined");
    await expectEnqueued(2, appt._id);
  });

  it("o worker envia o assunto do layout 7 e o texto fixo do WhatsApp (link_inscricao sem token)", async () => {
    const { n } = await run();
    for (const i of [0, 1, 2]) {
      const m = mentee(i).doc;
      const email = n.sent.find((s: any) => s.type === "registration_cancelled" && s.channel === "email" && s.to === m.email);
      expect(email, `e-mail de ${m.name}`).toBeTruthy();
      expect(email.subject).toBe(SUBJECT);
      expect(email.html).toContain(`href="${BASE}/mentoria/inscricao"`);
      expect(email.html).toContain("Fazer nova inscrição");
      expect(email.text).toContain(`Tudo certo, ${m.name}. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu.`);
      expect(email.text).toContain(`${BASE}/mentoria/inscricao`);
      expect(email.text).not.toMatch(/\?t=|\/l\//);
      const wa = n.sent.find((s: any) => s.type === "registration_cancelled" && s.channel === "whatsapp" && s.to === m.phone);
      expect(wa, `WhatsApp de ${m.name}`).toBeTruthy();
      expect(wa.text).toBe(waText(m.name));
    }
    for (const i of [0, 1, 2]) for (const o of await items(i)) expect(o.status).toBe("sent");
  });

  it("se ela se inscreveu de novo antes do envio, os itens viram skipped e nada sai", async () => {
    const r = await asMentee(3).post("/api/public/me/actions", { action: "cancel" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await items(3)).toHaveLength(2);
    // nova inscrição (E02 reativa a cancelada)
    const reg = await b.anon.post("/api/public/mentees", {
      name: mentee(3).doc.name, email: mentee(3).doc.email, phone: "(81) 99910-0004", area: "dados", preferredPeriod: "any",
      consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    expect((await fresh(3)).status).toBe("waiting");
    const { n } = await run();
    expect(n.sent.filter((s: any) => s.type === "registration_cancelled")).toHaveLength(0);
    for (const o of await items(3)) expect(o).toMatchObject({ status: "skipped", lastError: "inscrição não está mais cancelada" });
  });

  it("cancelamento pela mentora (E26) ou pelo admin (E36, aguardando ou confirmada) não gera registration_cancelled", async () => {
    // mentora cancela uma confirmada: só o `cancelled` de sempre
    expect((await b.invite(0, 4, 8, 2)).status).toBe(201);
    expect((await asMentee(4).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const appt4 = (await c.appointments.findOne({ menteeId: mentee(4).doc._id }))!;
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${appt4._id}`, { action: "cancel" })).status).toBe(200);
    expect(await c.outbox.countDocuments({ type: "cancelled", appointmentId: appt4._id })).toBeGreaterThan(0);
    // admin cancela a inscrição de quem aguarda e de quem está confirmada (transição mentee_cancel com actor admin)
    expect((await b.admin.patch(`/api/admin/mentees/${mentee(5).doc._id}`, { action: "cancel" })).status).toBe(200);
    expect((await b.invite(1, 6, 9, 3)).status).toBe(201);
    expect((await asMentee(6).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const r = await b.admin.patch(`/api/admin/mentees/${mentee(6).doc._id}`, { action: "cancel" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await fresh(5)).status).toBe("cancelled");
    expect((await fresh(6)).status).toBe("cancelled");
    for (const i of [4, 5, 6]) expect(await items(i), mentee(i).doc.name).toHaveLength(0);
  });

  it("trocar de horário (mentee_reschedule) não gera registration_cancelled", async () => {
    expect((await b.invite(0, 7, 10, 4)).status).toBe(201);
    expect((await asMentee(7).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const r = await asMentee(7).post("/api/public/me/actions", { action: "reschedule" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await fresh(7)).status).toBe("waiting");
    expect(await items(7)).toHaveLength(0);
  });
});
