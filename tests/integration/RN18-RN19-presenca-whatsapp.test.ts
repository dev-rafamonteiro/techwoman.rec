import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN18 (confirmação de presença pelo WhatsApp/WAHA, E47) e RN19 (trocar de horário: E04 `reschedule`, E07, E08).
 * WhatsApp ligado só na config de teste (nada sai de verdade: o worker usa o MemoryNotifier).
 */
const api = await loadApi();
const HMAC_KEY = "chave-hmac-de-teste-rn18-nao-e-segredo";
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const WORKER_CONFIG = { whatsappEnabled: true, whatsappTransport: "waha" as const };
const digits = (s: string) => s.replace(/\D/g, "");

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN18/RN19 presença pelo WhatsApp e troca de horário", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const sign = (raw: string) => createHmac("sha512", HMAC_KEY).update(raw).digest("hex");
  /** POST /api/webhooks/waha com o corpo bruto; `sig` null = sem header. */
  const hook = async (body: unknown, sig?: string | null) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const s = sig === undefined ? sign(raw) : sig;
    if (s !== null) headers[HEADERS.wahaHmac.toLowerCase()] = s;
    const res = await b.app.inject({ method: "POST", url: "/api/webhooks/waha", headers, payload: raw });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };
  /** Evento `message` como o WAHA manda (from @lid, telefone em SenderAlt). */
  const msgEvent = (phone: string, o: { body: string; rowId?: string; hash?: string; fromMe?: boolean; from?: string }) => {
    const hash = o.hash ?? `3B${String(++seq).padStart(18, "0")}`;
    return {
      hash,
      event: {
        id: `evt_${hash}`,
        event: "message",
        session: "default",
        payload: {
          id: `false_167512398385333@lid_${hash}`,
          from: o.from ?? "167512398385333@lid",
          fromMe: o.fromMe ?? false,
          body: o.body,
          hasMedia: false,
          _data: {
            Info: { Chat: "167512398385333@lid", SenderAlt: `${digits(phone)}:47@s.whatsapp.net`, IsGroup: false, ID: hash },
            Message: o.rowId
              ? { listResponseMessage: { title: o.body, listType: 1, singleSelectReply: { selectedRowID: o.rowId } } }
              : { conversation: o.body },
          },
        },
      },
    };
  };
  const mentee = (i: number) => b.w.mentees[i]!;
  const slot = (i: number) => b.w.slotIds[i]!;
  const startOf = async (i: number) => (await c.events.findOne({}))!.slots[i]!.startAt;
  const accept = async (i: number) => {
    const r = await Client.asMentee(b.app, mentee(i).token).post("/api/public/me/actions", { action: "accept" });
    expect(r.status).toBe(200);
  };
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;

  beforeAll(async () => {
    b = await bootApi(api!, "presenca", {
      mentors: 2,
      mentees: 10,
      env: { WHATSAPP_ENABLED: "true", WHATSAPP_TRANSPORT: "waha", WAHA_WEBHOOK_HMAC_KEY: HMAC_KEY },
    });
    c = getCollections(b.t.db);
    await c.events.updateOne({}, { $set: { reminders: [
      { minutesBefore: 30, channels: ["whatsapp"] },
      { minutesBefore: 15, channels: ["whatsapp"] },
      { minutesBefore: 5, channels: ["whatsapp"] },
    ] } });
  });
  afterAll(async () => b?.close());

  describe("RN18 · lembrete com a List Message", () => {
    it("lembretes 30/15/5 pelo WhatsApp: só o de 30 leva presenceCheck (e só no item whatsapp)", async () => {
      expect((await b.invite(0, 0, 7, 0)).status).toBe(201);
      expect((await b.invite(1, 1, 7, 1)).status).toBe(201);
      await accept(0);
      await accept(1);
      const rem = await c.outbox.find({ type: "reminder", menteeId: mentee(0).doc._id }).sort({ nextAttemptAt: 1 }).toArray();
      expect(rem.map((r) => [r.payload["minutesBefore"], r.channel, r.payload["presenceCheck"] ?? false])).toEqual([
        [30, "whatsapp", true],
        [15, "whatsapp", false],
        [5, "whatsapp", false],
      ]);
    });

    it("o worker envia o de 30 como lista, com {minutos} da hora do envio, e grava presence_checks pending", async () => {
      const start = await startOf(7);
      const n = new api!.MemoryNotifier!();
      await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -28), config: WORKER_CONFIG });
      for (const i of [0, 1]) {
        const lists = n.sent.filter((m: any) => m.type === "reminder" && m.to === mentee(i).doc.phone);
        expect(lists).toHaveLength(1);
        const list = lists[0].list;
        expect(list).toBeTruthy();
        expect(list.description).toContain("faltam 28 minutos");
        const appt = await apptOf(i);
        expect(list.sections[0].rows.map((r: any) => r.rowId)).toEqual([`confirmar:${appt._id}`, `cancelar:${appt._id}`]);
        const pc = (await c.presenceChecks.findOne({ _id: appt._id }))!;
        expect(pc).toMatchObject({ menteeId: mentee(i).doc._id, phone: digits(mentee(i).doc.phone!), status: "pending", answeredAt: null, answer: null });
        expect(pc.messageId).toMatch(/^MEM\d+$/);
      }
      // o de 15 e o de 5 ainda não saíram
      expect(await c.outbox.countDocuments({ type: "reminder", status: "pending" })).toBe(4);
    });
  });

  describe("RN18 · E47 webhook do WAHA", () => {
    beforeAll(async () => {
      b.clock.now = min(await startOf(7), -27);
    });

    it("assinatura inválida ou ausente -> 401, nada gravado", async () => {
      const { event } = msgEvent(mentee(0).doc.phone!, { body: "sim" });
      expect((await hook(event, "0".repeat(128))).status).toBe(401);
      expect((await hook(event, null)).status).toBe(401);
      expect((await hook(event, sign(JSON.stringify(event) + " "))).status).toBe(401);
      expect((await hook("{nem json", null)).status).toBe(401);
      expect(await c.whatsappInbound.countDocuments({})).toBe(0);
      expect((await c.presenceChecks.findOne({ _id: (await apptOf(0))._id }))!.status).toBe("pending");
    });

    it("assinado mas não é mensagem (ou não é JSON): 200 sem efeito", async () => {
      expect((await hook({ event: "session.status", session: "default", payload: { status: "WORKING" } })).status).toBe(200);
      expect((await hook("{nem json")).status).toBe(200);
      expect(await c.whatsappInbound.countDocuments({})).toBe(0);
    });

    it("toque em 'Sim, confirmo' -> presença confirmed + presence_confirmed na fila; o mesmo evento de novo não repete", async () => {
      const appt = await apptOf(0);
      const { event, hash } = msgEvent(mentee(0).doc.phone!, { body: "Sim, confirmo", rowId: `confirmar:${appt._id}` });
      expect(await hook(event)).toEqual({ status: 200, body: { ok: true } });
      expect(await hook(event)).toEqual({ status: 200, body: { ok: true } });
      const pc = (await c.presenceChecks.findOne({ _id: appt._id }))!;
      expect(pc.status).toBe("confirmed");
      expect(pc.answer).toMatchObject({ kind: "list", interpretation: "confirm" });
      const out = await c.outbox.find({ type: "presence_confirmed" }).toArray();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ channel: "whatsapp", to: mentee(0).doc.phone, appointmentId: appt._id, dedupeKey: `presence:${hash}:whatsapp` });
      expect(await c.whatsappInbound.countDocuments({ _id: hash })).toBe(1);
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("confirmed");
    });

    it("texto 'não posso' -> mentee_reschedule: cancela, volta à fila com prioridade e o mesmo queuedAt; presence_cancelled com link de P6", async () => {
      const appt = await apptOf(1);
      const before = (await c.mentees.findOne({ _id: mentee(1).doc._id }))!;
      const { event, hash } = msgEvent(mentee(1).doc.phone!, { body: "Não posso" });
      expect((await hook(event)).status).toBe(200);
      expect((await hook(event)).status).toBe(200);

      const a = (await c.appointments.findOne({ _id: appt._id }))!;
      expect(a.status).toBe("cancelled");
      expect(a.slotLock).toBeUndefined();
      expect(a.menteeLock).toBeUndefined();
      expect(a.history.at(-1)).toMatchObject({ from: "confirmed", to: "cancelled", by: { role: "mentee" } });
      const m = (await c.mentees.findOne({ _id: mentee(1).doc._id }))!;
      expect(m).toMatchObject({ status: "waiting", priority: true, priorityReason: "declined_schedule", lastOutcome: "declined_schedule", currentAppointmentId: null });
      expect(m.queuedAt.getTime()).toBe(before.queuedAt.getTime());
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!).toMatchObject({ status: "cancelled", answer: { kind: "text", interpretation: "cancel" } });
      const out = await c.outbox.find({ type: "presence_cancelled" }).toArray();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ channel: "whatsapp", menteeId: mentee(1).doc._id, dedupeKey: `presence:${hash}:whatsapp` });
      expect(await c.auditLogs.countDocuments({ action: "appointment.reschedule", entityId: String(appt._id) })).toBe(1);
    });

    it("o worker envia as respostas fixas e descarta os lembretes seguintes da mentoria cancelada", async () => {
      const start = await startOf(7);
      const n = new api!.MemoryNotifier!();
      await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -26), config: WORKER_CONFIG });
      const conf = n.sent.find((m: any) => m.type === "presence_confirmed");
      expect(conf.text).toMatch(/^Obrigada por confirmar, Participante 1!/);
      const canc = n.sent.find((m: any) => m.type === "presence_cancelled");
      expect(canc.channel).toBe("whatsapp");
      expect(canc.text).toContain("foi cancelada e você continua na fila com prioridade");
      expect(canc.text).toMatch(/\/l\/[0-9A-Za-z]{7}/);

      await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -4), config: WORKER_CONFIG });
      const rem1 = await c.outbox.find({ type: "reminder", menteeId: mentee(1).doc._id }).sort({ nextAttemptAt: 1 }).toArray();
      expect(rem1.map((r) => r.status)).toEqual(["sent", "skipped", "skipped"]);
      const rem0 = await c.outbox.find({ type: "reminder", menteeId: mentee(0).doc._id }).toArray();
      expect(rem0.map((r) => r.status)).toEqual(["sent", "sent", "sent"]);
      // só o primeiro saiu como lista
      expect(n.sent.filter((m: any) => m.type === "reminder" && m.list)).toHaveLength(0);
    });

    it("texto ambíguo -> presence_unclear, pedido continua pending; fromMe e grupo são ignorados", async () => {
      expect((await b.invite(0, 2, 8, 0)).status).toBe(201);
      await accept(2);
      const start = await startOf(8);
      b.clock.now = min(start, -27);
      await api!.processOutbox!(b.t.db, { notifier: new api!.MemoryNotifier!(), now: min(start, -28), config: WORKER_CONFIG });
      const appt = await apptOf(2);
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("pending");

      const phone = mentee(2).doc.phone!;
      const inbound0 = await c.whatsappInbound.countDocuments({});
      expect((await hook(msgEvent(phone, { body: "sim", fromMe: true }).event)).status).toBe(200);
      expect((await hook(msgEvent(phone, { body: "sim", from: "120363025555@g.us" }).event)).status).toBe(200);
      expect(await c.whatsappInbound.countDocuments({})).toBe(inbound0);
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("pending");

      const { event, hash } = msgEvent(phone, { body: "talvez, depende do trânsito" });
      expect((await hook(event)).status).toBe(200);
      const out = await c.outbox.find({ type: "presence_unclear" }).toArray();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ channel: "whatsapp", appointmentId: appt._id, dedupeKey: `presence:${hash}:whatsapp` });
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("pending");
      expect((await c.whatsappInbound.findOne({ _id: hash }))!.result).toBe("unclear");
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("confirmed");
    });

    it("cancelamento pela mentora fecha o pedido; resposta depois é ignorada", async () => {
      const appt = await apptOf(2);
      expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${appt._id}`, { action: "cancel" })).status).toBe(200);
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("closed");
      const n0 = await c.outbox.countDocuments({ type: { $in: ["presence_confirmed", "presence_cancelled", "presence_unclear"] } });
      const { event, hash } = msgEvent(mentee(2).doc.phone!, { body: "sim", rowId: `confirmar:${appt._id}` });
      expect((await hook(event)).status).toBe(200);
      expect((await c.whatsappInbound.findOne({ _id: hash }))!.result).toBe("ignored");
      expect(await c.outbox.countDocuments({ type: { $in: ["presence_confirmed", "presence_cancelled", "presence_unclear"] } })).toBe(n0);
    });
  });

  describe("RN19 · E04 reschedule, E07 e E08", () => {
    const m3 = () => Client.asMentee(b.app, mentee(3).token);
    const slots = async (cl: Client) => {
      const r = await cl.get("/api/public/me/slots");
      expect(r.status).toBe(200);
      return r.body.items.map((s: any) => s.slotId);
    };

    beforeAll(async () => {
      b.clock.now = (await c.events.findOne({}))!.slots[0]!.startAt;
      b.clock.now = min(b.clock.now, -60);
    });

    it("E04 reschedule só de confirmed: cancela e volta à fila com prioridade; repetir -> INVALID_STATE", async () => {
      // ainda aguardando: não há o que trocar
      expect((await m3().post("/api/public/me/actions", { action: "reschedule" })).body.code).toBe("INVALID_STATE");
      expect((await b.invite(1, 3, 8, 2)).status).toBe(201);
      await accept(3);
      const appt = await apptOf(3);
      const r = await m3().post("/api/public/me/actions", { action: "reschedule" });
      expect(r.status).toBe(200);
      expect(r.body.mentee.status).toBe("waiting");
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
      expect(await c.mentees.findOne({ _id: mentee(3).doc._id })).toMatchObject({ status: "waiting", priority: true, priorityReason: "declined_schedule", lastOutcome: "declined_schedule" });
      const again = await m3().post("/api/public/me/actions", { action: "reschedule" });
      expect([again.status, again.body.code]).toEqual([409, "INVALID_STATE"]);
    });

    it("E07 lista só horários válidos e livres (antecedência, disponibilidade, área, mentora ocupada, mesa livre)", async () => {
      const [mt0, mt1] = b.w.mentors.map((m) => m._id);
      const S = (await c.events.findOne({}))!.slots;
      b.clock.now = min(S[1]!.startAt, -5); // s02 em 5 min: fora (antecedência mínima de 10)
      await c.mentees.updateOne({ _id: mentee(3).doc._id }, { $set: { preferredPeriod: "morning" } });
      await c.users.updateMany({ _id: { $in: [mt0!, mt1!] } }, { $set: { availability: ["s02", "s03", "s04", "s05", "s06", "s07"] } });

      const r = await m3().get("/api/public/me/slots");
      expect(r.status).toBe(200);
      expect(r.body.items.map((s: any) => s.slotId)).toEqual(["s03", "s04", "s05", "s06", "s07"]);
      expect(r.body.items.find((s: any) => s.slotId === "s03").matchesPeriod).toBe(true); // 11:30
      expect(r.body.items.find((s: any) => s.slotId === "s04").matchesPeriod).toBe(false); // 12:15
      expect(r.body.items[0]).toMatchObject({ startAt: S[2]!.startAt.toISOString(), endAt: S[2]!.endAt.toISOString() });

      // s05: mentora 0 ocupada (convite ativo) e a 1 sem disponibilidade; s07 só a 0
      b.clock.now = min(S[2]!.startAt, -5);
      expect((await b.invite(0, 6, 4, 0)).status).toBe(201);
      await c.users.updateOne({ _id: mt1! }, { $set: { availability: ["s04", "s06"] } });
      expect(await slots(m3())).toEqual(["s04", "s06", "s07"]);

      // mentora 0 de outra área não conta
      await c.users.updateOne({ _id: mt0! }, { $set: { areas: ["ux"] } });
      expect(await slots(m3())).toEqual(["s04", "s06"]);
      await c.users.updateOne({ _id: mt0! }, { $set: { areas: ["dados"] } });

      // uma só mesa ativa, ocupada no s04 pela mentora 1: mentora 0 livre, mas sem mesa
      const others = b.w.tables.slice(1).map((t) => t._id);
      await c.tables.updateMany({ _id: { $in: others } }, { $set: { active: false } });
      expect((await b.invite(1, 7, 3, 0)).status).toBe(201);
      expect(await slots(m3())).toEqual(["s06", "s07"]);
      await c.tables.updateMany({ _id: { $in: others } }, { $set: { active: true } });
      expect(await slots(m3())).toEqual(["s04", "s06", "s07"]);

      // mais tarde: só o que ainda está à frente com antecedência
      const keep = b.clock.now;
      b.clock.now = min(S[5]!.startAt, -5);
      expect(await slots(m3())).toEqual(["s07"]);
      b.clock.now = keep;
    });

    it("E08 confirma com a mentora com menos mentorias ativas, mesa livre, mensagens e lembretes; replay da chave = mesma resposta", async () => {
      const [mt0, mt1] = b.w.mentors.map((m) => m._id);
      // s07: as duas livres; mentora 0 tem 2 ativas (s09 e s05), a 1 tem 1 (s04)
      await c.users.updateOne({ _id: mt1! }, { $set: { availability: ["s04", "s07"] } });
      const key = { [HEADERS.idempotencyKey.toLowerCase()]: "e08-a" };
      const r1 = await m3().post("/api/public/me/book", { slotId: "s07" }, key);
      expect(r1.status).toBe(200);
      expect(r1.body.mentee.status).toBe("confirmed");
      expect(r1.body.appointment.status).toBe("confirmed");
      const r2 = await m3().post("/api/public/me/book", { slotId: "s07" }, key);
      expect(r2.status).toBe(200);
      expect(r2.body).toEqual(r1.body);

      const booked = await c.appointments.find({ menteeId: mentee(3).doc._id, slotId: "s07" }).toArray();
      expect(booked).toHaveLength(1);
      const a = booked[0]!;
      expect(a).toMatchObject({ status: "confirmed", mentorId: mt1, createdBy: { userId: mt1, role: "mentor" }, confirmedBy: { userId: null, role: "mentee" }, slotLock: true, menteeLock: true });
      expect(String(a.mentorId)).not.toBe(String(mt0));
      const table = (await c.tables.findOne({ _id: a.tableId }))!;
      expect(table.active).toBe(true);
      expect(await c.appointments.countDocuments({ slotId: "s07", tableId: a.tableId, slotLock: true })).toBe(1);
      expect(await c.mentees.findOne({ _id: mentee(3).doc._id })).toMatchObject({ status: "confirmed", priority: false, priorityReason: null, lastOutcome: null, currentAppointmentId: a._id });

      const out = await c.outbox.find({ appointmentId: a._id }).toArray();
      expect(out.filter((o) => o.type === "confirmed").map((o) => o.channel).sort()).toEqual(["email", "whatsapp"]);
      const rem = out.filter((o) => o.type === "reminder").sort((x, y) => x.nextAttemptAt.getTime() - y.nextAttemptAt.getTime());
      expect(rem.map((o) => [o.payload["minutesBefore"], o.payload["presenceCheck"] ?? false])).toEqual([[30, true], [15, false], [5, false]]);

      // já agendada: E07 e E08 recusam
      expect((await m3().get("/api/public/me/slots")).body.code).toBe("INVALID_STATE");
      const r3 = await m3().post("/api/public/me/book", { slotId: "s06" });
      expect([r3.status, r3.body.code]).toEqual([409, "INVALID_STATE"]);
    });

    it("E08 · duas participantes no mesmo horário com uma só mentora livre: uma confirma, a outra 409 SLOT_UNAVAILABLE", async () => {
      const [mt0, mt1] = b.w.mentors.map((m) => m._id);
      await c.users.updateOne({ _id: mt1! }, { $set: { availability: ["s04"] } });
      await c.mentees.updateMany({ _id: { $in: [mentee(4).doc._id, mentee(5).doc._id] } }, { $set: { lastOutcome: "declined_schedule", priority: true, priorityReason: "declined_schedule" } });
      const rs = await Promise.all([4, 5].map((i) => Client.asMentee(b.app, mentee(i).token).post("/api/public/me/book", { slotId: "s06" })));
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(rs.find((r) => r.status === 409)!.body.code).toBe("SLOT_UNAVAILABLE");
      const at = await c.appointments.find({ slotId: "s06", slotLock: true }).toArray();
      expect(at).toHaveLength(1);
      expect(String(at[0]!.mentorId)).toBe(String(mt0));
      const loser = rs[0]!.status === 409 ? 4 : 5;
      expect(await c.mentees.findOne({ _id: mentee(loser).doc._id })).toMatchObject({ status: "waiting", lastOutcome: "declined_schedule" });
      // em sequência: igual
      const again = await Client.asMentee(b.app, mentee(loser).token).post("/api/public/me/book", { slotId: "s06" });
      expect([again.status, again.body.code]).toEqual([409, "SLOT_UNAVAILABLE"]);
    });

    it("sem trocar de horário (canSelfBook falso): E07 e E08 -> 409 INVALID_STATE", async () => {
      const cl = Client.asMentee(b.app, mentee(8).token);
      const r7 = await cl.get("/api/public/me/slots");
      expect([r7.status, r7.body.code]).toEqual([409, "INVALID_STATE"]);
      const r8 = await cl.post("/api/public/me/book", { slotId: "s07" });
      expect([r8.status, r8.body.code]).toEqual([409, "INVALID_STATE"]);
      expect(await c.appointments.countDocuments({ menteeId: mentee(8).doc._id })).toBe(0);
    });
  });
});
