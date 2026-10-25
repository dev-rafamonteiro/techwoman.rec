import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN20 (convite pelo WhatsApp/WAHA como List Message, resposta direta por E47).
 * WhatsApp ligado só na config de teste (nada sai de verdade: o worker usa o MemoryNotifier).
 */
const api = await loadApi();
const HMAC_KEY = "chave-hmac-de-teste-rn20-nao-e-segredo";
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const WORKER_CONFIG = { whatsappEnabled: true, whatsappTransport: "waha" as const };
const digits = (s: string) => s.replace(/\D/g, "");
const INVITE_REPLIES = ["invite_closed", "invite_decline_link", "invite_unclear"];

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN20 convite pelo WhatsApp com resposta direta", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  let t0: Date;
  const sign = (raw: string) => createHmac("sha512", HMAC_KEY).update(raw).digest("hex");
  const hook = async (body: unknown) => {
    const raw = JSON.stringify(body);
    const res = await b.app.inject({
      method: "POST",
      url: "/api/webhooks/waha",
      headers: { "content-type": "application/json", [HEADERS.wahaHmac.toLowerCase()]: sign(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
  };
  /** Evento `message` como o WAHA manda (from @lid, telefone em SenderAlt). */
  const msgEvent = (phone: string, o: { body: string; rowId?: string }) => {
    const hash = `4C${String(++seq).padStart(18, "0")}`;
    return {
      hash,
      event: {
        id: `evt_${hash}`,
        event: "message",
        session: "default",
        payload: {
          id: `false_167512398385333@lid_${hash}`,
          from: "167512398385333@lid",
          fromMe: false,
          body: o.body,
          _data: {
            Info: { SenderAlt: `${digits(phone)}:47@s.whatsapp.net` },
            Message: o.rowId ? { listResponseMessage: { singleSelectReply: { selectedRowID: o.rowId } } } : { conversation: o.body },
          },
        },
      },
    };
  };
  const mentee = (i: number) => b.w.mentees[i]!;
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const check = async (i: number) => (await c.presenceChecks.findOne({ _id: (await apptOf(i))._id }))!;
  const replies = (type: string) => c.outbox.find({ type: type as never }).toArray();
  const inbound = async (hash: string) => (await c.whatsappInbound.findOne({ _id: hash }))!.result;

  beforeAll(async () => {
    b = await bootApi(api!, "convite-wa", {
      mentors: 2,
      mentees: 8,
      env: { WHATSAPP_ENABLED: "true", WHATSAPP_TRANSPORT: "waha", WAHA_WEBHOOK_HMAC_KEY: HMAC_KEY },
    });
    c = getCollections(b.t.db);
    t0 = b.clock.now;
    await c.events.updateOne({}, { $set: { reminders: [{ minutesBefore: 30, channels: ["whatsapp"] }] } });
  });
  afterAll(async () => b?.close());

  it("o worker envia o convite pelo WhatsApp como List Message (texto da UI-SPEC) e grava presence_checks kind invite", async () => {
    expect((await b.invite(0, 0, 8, 0)).status).toBe(201);
    expect((await b.invite(1, 1, 8, 1)).status).toBe(201);
    expect((await b.invite(0, 2, 9, 0)).status).toBe(201);
    expect((await b.invite(1, 3, 9, 1)).status).toBe(201);
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: WORKER_CONFIG });

    const wa = n.sent.filter((m: any) => m.type === "invite" && m.channel === "whatsapp");
    expect(wa).toHaveLength(4);
    // o e-mail do convite continua igual (sem lista)
    expect(n.sent.filter((m: any) => m.type === "invite" && m.channel === "email" && !m.list)).toHaveLength(4);
    const appt = await apptOf(0);
    const msg = wa.find((m: any) => m.to === mentee(0).doc.phone);
    expect(msg.list).toMatchObject({ title: "Oi, Participante 1!", footer: "Se preferir, responda SIM ou NÃO", button: "Responder" });
    expect(msg.list.description).toMatch(/^Mentora 1 quer te mentorar às \d{1,2}h\d{2}, na Mesa 1\. Você aceita\? Responda até \d{1,2}h\d{2}\.\nDetalhes: http\S+\/l\/[0-9A-Za-z]{7}$/);
    expect(msg.list.sections[0].rows).toEqual([
      { title: "Aceito", rowId: `aceitar:${appt._id}`, description: null },
      { title: "Não posso", rowId: `recusar:${appt._id}`, description: "Você conta o motivo na sua página" },
    ]);
    for (const i of [0, 1, 2, 3]) {
      const pc = await check(i);
      expect(pc).toMatchObject({ kind: "invite", menteeId: mentee(i).doc._id, phone: digits(mentee(i).doc.phone!), status: "pending", answeredAt: null, answer: null });
      expect(pc.messageId).toMatch(/^MEM\d+$/);
    }
  });

  it("convite já respondido antes do envio: o item whatsapp é descartado e não grava presence_checks", async () => {
    expect((await b.invite(0, 4, 10, 0)).status).toBe(201);
    const r = await Client.asMentee(b.app, mentee(4).token).post("/api/public/me/actions", { action: "accept" });
    expect(r.status).toBe(200);
    const appt = await apptOf(4);
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: WORKER_CONFIG });
    const item = (await c.outbox.findOne({ type: "invite", channel: "whatsapp", appointmentId: appt._id }))!;
    expect(item).toMatchObject({ status: "skipped", lastError: "convite não está mais ativo" });
    expect(n.sent.filter((m: any) => m.type === "invite" && m.to === mentee(4).doc.phone)).toHaveLength(0);
    expect(await c.presenceChecks.findOne({ _id: appt._id })).toBeNull();
  });

  it("toque numa opção da lista de presença (confirmar:) para um convite: ignorado, nada muda", async () => {
    const appt = await apptOf(0);
    const { event, hash } = msgEvent(mentee(0).doc.phone!, { body: "Sim, confirmo", rowId: `confirmar:${appt._id}` });
    await hook(event);
    expect(await inbound(hash)).toBe("ignored");
    expect((await check(0)).status).toBe("pending");
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("invited");
    expect(await c.outbox.countDocuments({ type: { $in: [...INVITE_REPLIES, "presence_confirmed", "presence_cancelled", "presence_unclear"] as never[] } })).toBe(0);
  });

  it("'Não posso' -> invite_decline_link, nada muda e o registro continua pending", async () => {
    const appt = await apptOf(0);
    const { event, hash } = msgEvent(mentee(0).doc.phone!, { body: "Não posso", rowId: `recusar:${appt._id}` });
    await hook(event);
    await hook(event);
    expect(await inbound(hash)).toBe("cancel");
    const out = await replies("invite_decline_link");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: "whatsapp", to: mentee(0).doc.phone, appointmentId: appt._id, dedupeKey: `presence:${hash}:whatsapp` });
    expect((await check(0)).status).toBe("pending");
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("invited");
    expect((await c.mentees.findOne({ _id: mentee(0).doc._id }))!.status).toBe("invited");
  });

  it("depois, 'Aceito' -> accept como E04: confirmed, confirmação e lembretes na fila, auditoria; registro confirmed", async () => {
    const appt = await apptOf(0);
    const { event, hash } = msgEvent(mentee(0).doc.phone!, { body: "Aceito", rowId: `aceitar:${appt._id}` });
    await hook(event);
    await hook(event); // o mesmo evento de novo (id repetido): um só efeito
    expect(await inbound(hash)).toBe("confirm");
    expect(await c.whatsappInbound.countDocuments({ _id: hash })).toBe(1);
    const a = (await c.appointments.findOne({ _id: appt._id }))!;
    expect(a).toMatchObject({ status: "confirmed", confirmedBy: { userId: null, role: "mentee" } });
    expect(a.history.at(-1)).toMatchObject({ from: "invited", to: "confirmed", by: { role: "mentee" } });
    expect((await c.mentees.findOne({ _id: mentee(0).doc._id }))!.status).toBe("confirmed");
    expect(await check(0)).toMatchObject({ kind: "invite", status: "confirmed", answer: { kind: "list", interpretation: "confirm" } });
    const out = await c.outbox.find({ appointmentId: appt._id }).toArray();
    expect(out.filter((o) => o.type === "confirmed").map((o) => o.channel).sort()).toEqual(["email", "whatsapp"]);
    expect(out.filter((o) => o.type === "reminder").map((o) => o.payload["presenceCheck"])).toEqual([true]);
    expect(a.history.filter((h) => h.to === "confirmed")).toHaveLength(1);
    expect(await c.auditLogs.countDocuments({ action: "appointment.accept", entityId: String(appt._id) })).toBe(1);
    // a resposta é a `confirmed` normal: nenhuma invite_* nova
    expect(await c.outbox.countDocuments({ type: { $in: INVITE_REPLIES as never[] } })).toBe(1);
  });

  it("texto ambíguo -> invite_unclear (pending); depois 'sim' digitado aceita", async () => {
    const phone = mentee(1).doc.phone!;
    const e1 = msgEvent(phone, { body: "talvez, depende" });
    await hook(e1.event);
    expect(await inbound(e1.hash)).toBe("unclear");
    expect((await replies("invite_unclear"))[0]).toMatchObject({ menteeId: mentee(1).doc._id, dedupeKey: `presence:${e1.hash}:whatsapp` });
    expect((await check(1)).status).toBe("pending");

    const e2 = msgEvent(phone, { body: "sim" });
    await hook(e2.event);
    expect((await apptOf(1)).status).toBe("confirmed");
    expect(await check(1)).toMatchObject({ status: "confirmed", answer: { kind: "text", interpretation: "confirm" } });
  });

  it("convite recusado pela página ou vencido: 'Aceito' fecha o registro e envia invite_closed, sem mudar nada", async () => {
    // participante 4 recusa pela página (RN06): o registro continua pending até a próxima resposta
    const r = await Client.asMentee(b.app, mentee(3).token).post("/api/public/me/actions", { action: "decline", reason: "no_interest" });
    expect(r.status).toBe(200);
    const a3 = await apptOf(3);
    const e1 = msgEvent(mentee(3).doc.phone!, { body: "Aceito", rowId: `aceitar:${a3._id}` });
    await hook(e1.event);
    expect(await inbound(e1.hash)).toBe("ignored");
    expect((await c.appointments.findOne({ _id: a3._id }))!.status).toBe("declined");
    expect(await check(3)).toMatchObject({ status: "closed", answer: { kind: "list", interpretation: "confirm" } });

    // participante 3: o prazo venceu (o job de expiração ainda não rodou); texto "aceito"
    const a2 = await apptOf(2);
    b.clock.now = min(a2.expiresAt!, 1);
    const e2 = msgEvent(mentee(2).doc.phone!, { body: "Aceito!" });
    await hook(e2.event);
    expect((await c.appointments.findOne({ _id: a2._id }))!.status).toBe("invited");
    expect((await check(2)).status).toBe("closed");

    const closed = await replies("invite_closed");
    expect(closed.map((o) => [String(o.appointmentId), o.dedupeKey]).sort()).toEqual(
      [[String(a3._id), `presence:${e1.hash}:whatsapp`], [String(a2._id), `presence:${e2.hash}:whatsapp`]].sort(),
    );
    // registro fechado: nova resposta é ignorada, sem resposta
    const e3 = msgEvent(mentee(2).doc.phone!, { body: "sim" });
    await hook(e3.event);
    expect(await inbound(e3.hash)).toBe("ignored");
    expect(await replies("invite_closed")).toHaveLength(2);
  });

  it("o worker envia as respostas fixas (texto da UI-SPEC) só pelo WhatsApp", async () => {
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: WORKER_CONFIG });
    const byType = (t: string) => n.sent.filter((m: any) => m.type === t);
    const decline = byType("invite_decline_link");
    expect(decline).toHaveLength(1);
    expect(decline[0].channel).toBe("whatsapp");
    expect(decline[0].text).toMatch(/^Tudo bem, Participante 1! Para recusar, conte o motivo na sua página: http\S+\/l\/[0-9A-Za-z]{7}\. Se for o horário, você continua na fila com prioridade\.$/);
    expect(byType("invite_closed").map((m: any) => m.text)).toEqual([
      expect.stringMatching(/^Este convite não está mais disponível\. Veja como está sua inscrição: http\S+\/l\/[0-9A-Za-z]{7}$/),
      expect.stringMatching(/^Este convite não está mais disponível\./),
    ]);
    expect(byType("invite_unclear").map((m: any) => m.text)).toEqual(["Não entendi. Toque em Aceito ou Não posso, ou responda SIM ou NÃO."]);
    expect(n.sent.filter((m: any) => INVITE_REPLIES.includes(m.type) && (m.channel !== "whatsapp" || m.list))).toHaveLength(0);
  });

  it("toque em 'Aceito' na lista depois do prazo (relógio após expiresAt): invite_closed, sem transição", async () => {
    expect((await b.invite(1, 5, 10, 1)).status).toBe(201);
    const appt = await apptOf(5);
    await api!.processOutbox!(b.t.db, { notifier: new api!.MemoryNotifier!(), now: b.clock.now, config: WORKER_CONFIG });
    expect(await check(5)).toMatchObject({ kind: "invite", status: "pending" });

    b.clock.now = min(appt.expiresAt!, 1);
    const { event, hash } = msgEvent(mentee(5).doc.phone!, { body: "Aceito", rowId: `aceitar:${appt._id}` });
    await hook(event);
    expect(await inbound(hash)).toBe("ignored");
    const a = (await c.appointments.findOne({ _id: appt._id }))!;
    expect(a.status).toBe("invited");
    expect(a.history.filter((h) => h.to === "confirmed")).toHaveLength(0);
    expect((await c.mentees.findOne({ _id: mentee(5).doc._id }))!.status).toBe("invited");
    expect(await check(5)).toMatchObject({ status: "closed", answer: { kind: "list", interpretation: "confirm" } });
    expect(await c.outbox.countDocuments({ type: "invite_closed", appointmentId: appt._id, dedupeKey: `presence:${hash}:whatsapp` })).toBe(1);
    expect(await c.outbox.countDocuments({ type: "confirmed", appointmentId: appt._id })).toBe(0);
    expect(await c.auditLogs.countDocuments({ action: "appointment.accept", entityId: String(appt._id) })).toBe(0);
  });

  it("o lembrete de presença substitui o registro (kind presence); opção do convite depois é ignorada", async () => {
    const appt = await apptOf(0);
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(appt.startAt, -28), config: WORKER_CONFIG });
    expect(n.sent.filter((m: any) => m.type === "reminder" && m.to === mentee(0).doc.phone && m.list)).toHaveLength(1);
    expect(await check(0)).toMatchObject({ kind: "presence", status: "pending", answer: null });

    b.clock.now = min(appt.startAt, -27);
    const e1 = msgEvent(mentee(0).doc.phone!, { body: "Não posso", rowId: `recusar:${appt._id}` });
    await hook(e1.event);
    expect(await inbound(e1.hash)).toBe("ignored");
    expect((await check(0)).status).toBe("pending");
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("confirmed");

    // texto vai para a pergunta de presença: "sim" confirma presença (presence_confirmed), não invite_*
    const n0 = await c.outbox.countDocuments({ type: { $in: INVITE_REPLIES as never[] } });
    const e2 = msgEvent(mentee(0).doc.phone!, { body: "sim" });
    await hook(e2.event);
    expect(await check(0)).toMatchObject({ kind: "presence", status: "confirmed" });
    expect(await c.outbox.countDocuments({ type: "presence_confirmed", dedupeKey: `presence:${e2.hash}:whatsapp` })).toBe(1);
    expect(await c.outbox.countDocuments({ type: { $in: INVITE_REPLIES as never[] } })).toBe(n0);
  });
  it("aceito pelo WhatsApp, depois o lembrete de presença: 'não' digitado -> mentee_reschedule (RN18), não o fluxo do convite", async () => {
    // participante 2 aceitou com "sim" digitado; o lembrete de 30 (mesmo horário da participante 1) já substituiu o registro
    const appt = await apptOf(1);
    expect(appt.status).toBe("confirmed");
    expect(await check(1)).toMatchObject({ kind: "presence", status: "pending", answer: null });
    const before = (await c.mentees.findOne({ _id: mentee(1).doc._id }))!;
    const n0 = await c.outbox.countDocuments({ type: { $in: INVITE_REPLIES as never[] } });

    const { event, hash } = msgEvent(mentee(1).doc.phone!, { body: "não" });
    await hook(event);
    expect(await inbound(hash)).toBe("cancel");
    const a = (await c.appointments.findOne({ _id: appt._id }))!;
    expect(a.status).toBe("cancelled");
    expect(a.history.at(-1)).toMatchObject({ from: "confirmed", to: "cancelled", by: { role: "mentee" } });
    const m = (await c.mentees.findOne({ _id: mentee(1).doc._id }))!;
    expect(m).toMatchObject({ status: "waiting", priority: true, priorityReason: "declined_schedule", currentAppointmentId: null });
    expect(m.queuedAt.getTime()).toBe(before.queuedAt.getTime());
    expect(await check(1)).toMatchObject({ kind: "presence", status: "cancelled", answer: { kind: "text", interpretation: "cancel" } });
    expect(await c.outbox.countDocuments({ type: "presence_cancelled", dedupeKey: `presence:${hash}:whatsapp` })).toBe(1);
    expect(await c.auditLogs.countDocuments({ action: "appointment.reschedule", entityId: String(appt._id) })).toBe(1);
    expect(await c.outbox.countDocuments({ type: { $in: INVITE_REPLIES as never[] } })).toBe(n0);
  });

  it("convite aceito ou recusado pela página: o registro fecha e texto depois não recebe invite_closed; toque em 'Aceito' só responde se não foi aceito", async () => {
    b.clock.now = t0;
    expect((await b.invite(0, 6, 11, 0)).status).toBe(201);
    expect((await b.invite(1, 7, 11, 1)).status).toBe(201);
    await api!.processOutbox!(b.t.db, { notifier: new api!.MemoryNotifier!(), now: b.clock.now, config: WORKER_CONFIG });
    expect(await check(6)).toMatchObject({ kind: "invite", status: "pending" });
    expect(await check(7)).toMatchObject({ kind: "invite", status: "pending" });
    const replyTypes = [...INVITE_REPLIES, "presence_confirmed", "presence_cancelled", "presence_unclear"] as never[];
    const n0 = await c.outbox.countDocuments({ type: { $in: replyTypes } });

    // participante 7 aceita pela página: applyTransition fecha o convite pendente
    expect((await Client.asMentee(b.app, mentee(6).token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const a6 = await apptOf(6);
    expect(await check(6)).toMatchObject({ status: "closed", answeredAt: null });
    for (const body of ["ok obrigada", "sim"]) {
      const e = msgEvent(mentee(6).doc.phone!, { body });
      await hook(e.event);
      expect(await inbound(e.hash)).toBe("ignored");
    }
    // toque atrasado em "Aceito": registra, sem dizer que o convite acabou
    const tap = msgEvent(mentee(6).doc.phone!, { body: "Aceito", rowId: `aceitar:${a6._id}` });
    await hook(tap.event);
    expect(await inbound(tap.hash)).toBe("ignored");
    expect(await check(6)).toMatchObject({ status: "closed", answer: { kind: "list", interpretation: "confirm" } });
    expect((await c.appointments.findOne({ _id: a6._id }))!.status).toBe("confirmed");

    // participante 8 recusa pela página (volta para a fila): mensagem horas depois não cai no convite
    expect((await Client.asMentee(b.app, mentee(7).token).post("/api/public/me/actions", { action: "decline", reason: "schedule" })).status).toBe(200);
    expect(await check(7)).toMatchObject({ status: "closed", answeredAt: null });
    b.clock.now = min(t0, 180);
    const e7 = msgEvent(mentee(7).doc.phone!, { body: "oi, quando vou ser chamada?" });
    await hook(e7.event);
    expect(await inbound(e7.hash)).toBe("ignored");
    expect(await check(7)).toMatchObject({ status: "closed", answeredAt: null });

    expect(await c.outbox.countDocuments({ type: { $in: replyTypes } })).toBe(n0);
  });
});
