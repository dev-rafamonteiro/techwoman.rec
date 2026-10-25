import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * PLAN, Notificações: horário liberado pela própria participante, que volta à fila com prioridade (E04 `decline` com
 * motivo `schedule`, E04 `reschedule` de P6, "Não vou" no WhatsApp) -> `slot_released` por e-mail (layout 8) e
 * WhatsApp (texto fixo da UI-SPEC), dedupe `slot_released:<appointmentId>`. Pelo "Não vou" do WhatsApp (RN18) só o
 * e-mail: a resposta no WhatsApp é o `presence_cancelled`. Mentora/admin cancelando não dispara.
 * WhatsApp ligado só na config de teste (o worker usa o MemoryNotifier, nada sai de verdade).
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const HMAC_KEY = "chave-hmac-de-teste-slot-released-nao-e-segredo";
const WORKER_CONFIG = { whatsappEnabled: true, whatsappTransport: "waha" as const, publicBaseUrl: BASE };
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const digits = (s: string) => s.replace(/\D/g, "");

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("slot_released · horário liberado pela participante", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const mentee = (i: number) => b.w.mentees[i]!;
  const asMentee = (i: number) => Client.asMentee(b.app, mentee(i).token);
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const items = (i: number) => c.outbox.find({ type: "slot_released" as never, menteeId: mentee(i).doc._id }).sort({ channel: 1 }).toArray();
  const fresh = async (i: number) => (await c.mentees.findOne({ _id: mentee(i).doc._id }))!;
  const startOf = async (slotIdx: number) => (await c.events.findOne({}))!.slots[slotIdx]!.startAt;
  const run = async (now = b.clock.now) => {
    const n = new api!.MemoryNotifier!();
    const res = await api!.processOutbox!(b.t.db, { notifier: n, now, config: WORKER_CONFIG });
    return { n, res };
  };
  const accept = async (i: number) => expect((await asMentee(i).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
  /** Itens pendentes nos canais esperados, todos com a dedupeKey `slot_released:<appointmentId>:<canal>`. */
  const expectEnqueued = async (i: number, appointmentId: unknown, channels: string[]) => {
    const m = await fresh(i);
    expect(m).toMatchObject({ status: "waiting", priority: true, priorityReason: "declined_schedule" });
    const out = await items(i);
    expect(out.map((o) => o.channel)).toEqual(channels);
    for (const o of out) {
      expect(o).toMatchObject({ status: "pending", menteeId: m._id, appointmentId, dedupeKey: `slot_released:${appointmentId}:${o.channel}` });
      expect(o.to).toBe(o.channel === "email" ? m.email : m.phone);
    }
  };
  /** POST /api/webhooks/waha assinado, com o toque na opção `rowId` da List Message (como o WAHA manda). */
  const tap = async (phone: string, body: string, rowId: string) => {
    const hash = `3B${String(++seq).padStart(18, "0")}`;
    const raw = JSON.stringify({
      id: `evt_${hash}`,
      event: "message",
      session: "default",
      payload: {
        id: `false_167512398385333@lid_${hash}`,
        from: "167512398385333@lid",
        fromMe: false,
        body,
        hasMedia: false,
        _data: {
          Info: { Chat: "167512398385333@lid", SenderAlt: `${digits(phone)}:47@s.whatsapp.net`, IsGroup: false, ID: hash },
          Message: { listResponseMessage: { title: body, listType: 1, singleSelectReply: { selectedRowID: rowId } } },
        },
      },
    });
    const headers = { "content-type": "application/json", [HEADERS.wahaHmac.toLowerCase()]: createHmac("sha512", HMAC_KEY).update(raw).digest("hex") };
    const res = await b.app.inject({ method: "POST", url: "/api/webhooks/waha", headers, payload: raw });
    return { status: res.statusCode, hash };
  };

  beforeAll(async () => {
    b = await bootApi(api!, "horario-liberado", {
      mentors: 2,
      mentees: 6,
      env: { WHATSAPP_ENABLED: "true", WHATSAPP_TRANSPORT: "waha", WAHA_WEBHOOK_HMAC_KEY: HMAC_KEY },
    });
    c = getCollections(b.t.db);
  });
  afterAll(async () => b?.close());

  it("convite -> recusa 'Horário não serve' (decline_schedule): enfileira e-mail + WhatsApp", async () => {
    expect((await b.invite(0, 0, 6, 0)).status).toBe(201);
    const appt = await apptOf(0);
    const r = await asMentee(0).post("/api/public/me/actions", { action: "decline", reason: "schedule" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("declined");
    await expectEnqueued(0, appt._id, ["email", "whatsapp"]);
  });

  it("confirmada -> 'Trocar de horário' em P6 (mentee_reschedule): enfileira e-mail + WhatsApp", async () => {
    expect((await b.invite(1, 1, 6, 1)).status).toBe(201);
    await accept(1);
    const appt = await apptOf(1);
    const r = await asMentee(1).post("/api/public/me/actions", { action: "reschedule" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
    await expectEnqueued(1, appt._id, ["email", "whatsapp"]);
    // nem `cancelled` (aviso da mentora) nem `registration_cancelled`
    expect(await c.outbox.countDocuments({ type: { $in: ["cancelled", "registration_cancelled"] as never[] }, menteeId: mentee(1).doc._id })).toBe(0);
  });

  it("o worker envia o assunto do layout 8 e o texto fixo do WhatsApp, os dois com o link curto de P6", async () => {
    const { n } = await run();
    for (const i of [0, 1]) {
      const m = mentee(i).doc;
      const appt = await apptOf(i);
      const horario = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(appt.startAt).replace(":", "h");
      const email = n.sent.find((s: any) => s.type === "slot_released" && s.channel === "email" && s.to === m.email);
      expect(email, `e-mail de ${m.name}`).toBeTruthy();
      expect(email.subject).toBe(`Seu horário das ${horario} foi liberado`);
      expect(email.html).toContain("Escolher outro horário");
      expect(email.html).toMatch(new RegExp(`href="${BASE}/l/[0-9A-Za-z]{7}"`));
      expect(email.text).toContain(`Tudo bem, ${m.name}. O horário das ${horario} foi liberado, como você pediu.`);
      const wa = n.sent.find((s: any) => s.type === "slot_released" && s.channel === "whatsapp" && s.to === m.phone);
      expect(wa, `WhatsApp de ${m.name}`).toBeTruthy();
      expect(wa.list).toBeUndefined();
      expect(wa.text).toMatch(new RegExp(`^Tudo bem, ${m.name}\\. O horário das ${horario} foi liberado e você continua na fila com prioridade\\. Se quiser, escolha outro horário na sua página: ${BASE}/l/[0-9A-Za-z]{7}$`));
    }
    for (const i of [0, 1]) for (const o of await items(i)) expect(o.status).toBe("sent");
  });

  it("se ela já não está na fila (novo convite) antes do envio, os itens viram skipped e nada sai", async () => {
    expect((await b.invite(1, 3, 7, 1)).status).toBe(201);
    expect((await asMentee(3).post("/api/public/me/actions", { action: "decline", reason: "schedule" })).status).toBe(200);
    expect(await items(3)).toHaveLength(2);
    expect((await b.invite(1, 3, 8, 1)).status).toBe(201);
    expect((await fresh(3)).status).toBe("invited");
    const { n } = await run();
    expect(n.sent.filter((s: any) => s.type === "slot_released")).toHaveLength(0);
    for (const o of await items(3)) expect(o).toMatchObject({ status: "skipped", lastError: "participante não está mais na fila" });
  });

  it("cancelamento pela mentora (E26) ou pelo admin (E36) não gera slot_released", async () => {
    expect((await b.invite(0, 4, 8, 0)).status).toBe(201);
    await accept(4);
    const appt4 = await apptOf(4);
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${appt4._id}`, { action: "cancel" })).status).toBe(200);
    expect(await c.outbox.countDocuments({ type: "cancelled", appointmentId: appt4._id })).toBeGreaterThan(0);
    expect((await b.invite(0, 5, 9, 0)).status).toBe(201);
    await accept(5);
    expect((await b.admin.patch(`/api/admin/mentees/${mentee(5).doc._id}`, { action: "cancel" })).status).toBe(200);
    for (const i of [4, 5]) expect(await items(i), mentee(i).doc.name).toHaveLength(0);
  });

  it("'Não poderei ir' no WhatsApp (RN18): slot_released só por e-mail; no WhatsApp, só o presence_cancelled", async () => {
    expect((await b.invite(0, 2, 10, 2)).status).toBe(201);
    await accept(2);
    const appt = await apptOf(2);
    const start = await startOf(10);
    // o lembrete de 15 min sai pelo WAHA como List Message e abre o pedido de presença
    await run(min(start, -14));
    expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("pending");
    b.clock.now = min(start, -13);
    const { status, hash } = await tap(mentee(2).doc.phone!, "Não poderei ir", `cancelar:${appt._id}`);
    expect(status).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
    await expectEnqueued(2, appt._id, ["email"]);
    const replies = await c.outbox.find({ type: "presence_cancelled", menteeId: mentee(2).doc._id }).toArray();
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ channel: "whatsapp", dedupeKey: `presence:${hash}:whatsapp` });

    const { n } = await run(min(start, -12));
    const toPhone = n.sent.filter((s: any) => s.to === mentee(2).doc.phone && s.type !== "reminder");
    expect(toPhone.map((s: any) => s.type)).toEqual(["presence_cancelled"]);
    const email = n.sent.find((s: any) => s.type === "slot_released" && s.to === mentee(2).doc.email);
    expect(email?.channel).toBe("email");
    expect((await items(2))[0]!.status).toBe("sent");
  });
});
