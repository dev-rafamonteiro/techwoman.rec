import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS, formatTimeBR } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";
import { importMentors } from "../../src/db/import-mentors.js";

/**
 * PLAN, Notificações > Aviso à mentora: quando a própria participante libera o horário, a mentora recebe
 * `mentor_slot_released` (layout 9 + WhatsApp com texto fixo, se ela tiver `users.phone`), `userId` = mentora,
 * `menteeId` = null, `payload.reason` = confirmed_cancelled | invite_declined | invite_cancelled, dedupe
 * `mentor_slot_released:<appointmentId>:<canal>`. Mentora/admin agindo e expiração não avisam. O "Não vou" do WhatsApp
 * restringe só o aviso da participante (`notifyChannels`), não o da mentora. Também: `phone` em E28/E31/E32/E33.
 * WhatsApp ligado só na config de teste (o worker usa o MemoryNotifier, nada sai de verdade).
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const HMAC_KEY = "chave-hmac-de-teste-aviso-mentora-nao-e-segredo";
const WORKER_CONFIG = { whatsappEnabled: true, whatsappTransport: "waha" as const, publicBaseUrl: BASE };
const MENTOR_PHONE = "+5581988887777";
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const digits = (s: string) => s.replace(/\D/g, "");
const TYPE = "mentor_slot_released" as never;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier || !api?.expireInvites)("mentor_slot_released · aviso à mentora quando a participante libera o horário", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let seq = 0;
  const mentee = (i: number) => b.w.mentees[i]!;
  const mentor = (i: number) => b.w.mentors[i]!;
  const asMentee = (i: number) => Client.asMentee(b.app, mentee(i).token);
  const act = async (i: number, body: Record<string, unknown>) => {
    const r = await asMentee(i).post("/api/public/me/actions", body);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  };
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const itemsOf = (appointmentId: unknown) => c.outbox.find({ type: TYPE, appointmentId: appointmentId as never }).sort({ channel: 1 }).toArray();
  const startOf = async (slotIdx: number) => (await c.events.findOne({}))!.slots[slotIdx]!.startAt;
  const horarioOf = (d: Date) => formatTimeBR(d, "America/Recife");
  const run = async (now = b.clock.now) => {
    const n = new api!.MemoryNotifier!();
    const res = await api!.processOutbox!(b.t.db, { notifier: n, now, config: WORKER_CONFIG });
    return { n, res };
  };
  /** Itens do aviso à mentora `m` nos canais esperados, com o motivo e a dedupeKey do PLAN. */
  const expectMentorNotice = async (appointmentId: unknown, m: number, reason: string, channels: string[]) => {
    const out = await itemsOf(appointmentId);
    expect(out.map((o) => o.channel)).toEqual(channels);
    for (const o of out) {
      expect(o).toMatchObject({ status: "pending", userId: mentor(m)._id, menteeId: null, appointmentId, payload: { reason }, dedupeKey: `mentor_slot_released:${appointmentId}:${o.channel}` });
      expect(o.to).toBe(o.channel === "email" ? mentor(m).email : MENTOR_PHONE);
    }
  };
  /** POST /api/webhooks/waha assinado: toque na lista (`rowId`) ou texto digitado. */
  const inbound = async (phone: string, body: string, rowId?: string) => {
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
          Message: rowId ? { listResponseMessage: { title: body, listType: 1, singleSelectReply: { selectedRowID: rowId } } } : { conversation: body },
        },
      },
    });
    const headers = { "content-type": "application/json", [HEADERS.wahaHmac.toLowerCase()]: createHmac("sha512", HMAC_KEY).update(raw).digest("hex") };
    const res = await b.app.inject({ method: "POST", url: "/api/webhooks/waha", headers, payload: raw });
    return { status: res.statusCode, hash };
  };

  beforeAll(async () => {
    b = await bootApi(api!, "aviso-mentora", {
      mentors: 2,
      mentees: 12,
      env: { WHATSAPP_ENABLED: "true", WHATSAPP_TRANSPORT: "waha", WAHA_WEBHOOK_HMAC_KEY: HMAC_KEY },
    });
    c = getCollections(b.t.db);
  });
  afterAll(async () => b?.close());

  describe("WhatsApp da mentora (users.phone)", () => {
    it("E32: admin grava o WhatsApp normalizado em E.164; inválido é VALIDATION_ERROR em `phone`; null apaga", async () => {
      const id = String(mentor(1)._id);
      const bad = await b.admin.patch(`/api/admin/mentors/${id}`, { phone: "(00) 1234-56789" });
      expect(bad.status).toBe(422);
      expect(bad.body).toMatchObject({ code: "VALIDATION_ERROR", details: { field: "phone" } });
      const r = await b.admin.patch(`/api/admin/mentors/${id}`, { phone: "(81) 98888-7777" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.user.phone).toBe(MENTOR_PHONE);
      expect((await c.users.findOne({ _id: mentor(1)._id }))!.phone).toBe(MENTOR_PHONE);
      const cleared = await b.admin.patch(`/api/admin/mentors/${id}`, { phone: null });
      expect(cleared.body.user.phone).toBeNull();
      // a mentora 0 fica com WhatsApp para os casos abaixo; a 1, sem
      expect((await b.admin.patch(`/api/admin/mentors/${mentor(0)._id}`, { phone: "81 98888-7777" })).body.user.phone).toBe(MENTOR_PHONE);
    });

    it("E31: criar com WhatsApp (opcional) e recusar telefone inválido", async () => {
      const ok = await b.admin.post("/api/admin/mentors", { name: "Mentora Nova", email: "nova-whats@techwoman.test", phone: "(81) 97777-6666", areas: ["dados"] });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect(ok.body.user.phone).toBe("+5581977776666");
      const none = await b.admin.post("/api/admin/mentors", { name: "Sem Whats", email: "sem-whats@techwoman.test", areas: ["dados"] });
      expect(none.status).toBe(201);
      expect(none.body.user.phone).toBeNull();
      const bad = await b.admin.post("/api/admin/mentors", { name: "Whats Ruim", email: "whats-ruim@techwoman.test", phone: "(00) 91234-5678", areas: ["dados"] });
      expect(bad.status).toBe(422);
      expect(bad.body).toMatchObject({ code: "VALIDATION_ERROR", details: { field: "phone" } });
    });

    it("E28: a própria mentora edita o WhatsApp (M2) e E12 devolve o telefone", async () => {
      const r = await b.mentor[1]!.patch("/api/mentor/profile", { phone: "(81) 96666-5555" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.user.phone).toBe("+5581966665555");
      expect((await b.mentor[1]!.get("/api/auth/me")).body.user.phone).toBe("+5581966665555");
      expect((await b.mentor[1]!.patch("/api/mentor/profile", { phone: "999" })).status).toBe(422);
      expect((await b.mentor[1]!.patch("/api/mentor/profile", { phone: null })).body.user.phone).toBeNull();
    });

    it("E33: coluna `whatsapp` opcional; inválida vira erro da linha; sem a coluna, o telefone de quem já existe não muda", async () => {
      const event = (await c.events.findOne({}))!;
      const csv = "nome,email,whatsapp\nImportada Um,imp1@techwoman.test,(81) 95555-4444\nImportada Dois,imp2@techwoman.test,\nImportada Tres,imp3@techwoman.test,12345\n";
      const dry = await importMentors(b.t.db, csv, { event, dryRun: true });
      expect(dry.rows.map((r) => [r.status, r.data.phone])).toEqual([["valid", "+5581955554444"], ["valid", null], ["error", null]]);
      expect(dry.rows[2]!.errors).toContain("WhatsApp inválido. Informe DDD e número.");
      const res = await importMentors(b.t.db, csv, { event, dryRun: false });
      expect(res.summary.created).toBe(2);
      expect((await c.users.findOne({ email: "imp1@techwoman.test" }))!.phone).toBe("+5581955554444");
      expect((await c.users.findOne({ email: "imp2@techwoman.test" }))!.phone).toBeNull();
      await importMentors(b.t.db, "nome,email\nImportada Um,imp1@techwoman.test\n", { event, dryRun: false, onExisting: "update" });
      expect((await c.users.findOne({ email: "imp1@techwoman.test" }))!.phone).toBe("+5581955554444");
      await importMentors(b.t.db, "nome,email,whatsapp\nImportada Um,imp1@techwoman.test,\n", { event, dryRun: false, onExisting: "update" });
      expect((await c.users.findOne({ email: "imp1@techwoman.test" }))!.phone).toBeNull();
    });
  });

  describe("avisos à mentora", () => {
    it("(a) confirmada -> participante cancela em P6 (mentee_cancel): confirmed_cancelled por e-mail + WhatsApp", async () => {
      expect((await b.invite(0, 0, 0, 0)).status).toBe(201);
      await act(0, { action: "accept" });
      const appt = await apptOf(0);
      await act(0, { action: "cancel" });
      await expectMentorNotice(appt._id, 0, "confirmed_cancelled", ["email", "whatsapp"]);
    });

    it("(a) confirmada -> 'Trocar de horário' em P6 (mentee_reschedule): confirmed_cancelled", async () => {
      expect((await b.invite(0, 1, 1, 1)).status).toBe(201);
      await act(1, { action: "accept" });
      const appt = await apptOf(1);
      await act(1, { action: "reschedule" });
      await expectMentorNotice(appt._id, 0, "confirmed_cancelled", ["email", "whatsapp"]);
    });

    it("(b) convite recusado, 'Horário não serve' ou 'Não tenho mais interesse': invite_declined", async () => {
      expect((await b.invite(0, 2, 2, 2)).status).toBe(201);
      const a2 = await apptOf(2);
      await act(2, { action: "decline", reason: "schedule" });
      await expectMentorNotice(a2._id, 0, "invite_declined", ["email", "whatsapp"]);
      expect((await b.invite(0, 3, 3, 3)).status).toBe(201);
      const a3 = await apptOf(3);
      await act(3, { action: "decline", reason: "no_interest" });
      await expectMentorNotice(a3._id, 0, "invite_declined", ["email", "whatsapp"]);
    });

    it("(c) inscrição cancelada com convite pendente (E04 cancel de invited): invite_cancelled", async () => {
      expect((await b.invite(0, 4, 4, 4)).status).toBe(201);
      const appt = await apptOf(4);
      await act(4, { action: "cancel" });
      await expectMentorNotice(appt._id, 0, "invite_cancelled", ["email", "whatsapp"]);
    });

    it("mentora sem WhatsApp: só e-mail", async () => {
      expect((await c.users.findOne({ _id: mentor(1)._id }))!.phone ?? null).toBeNull();
      expect((await b.invite(1, 5, 5, 5)).status).toBe(201);
      const appt = await apptOf(5);
      await act(5, { action: "decline", reason: "schedule" });
      const out = await itemsOf(appt._id);
      expect(out.map((o) => [o.channel, o.to])).toEqual([["email", mentor(1).email]]);
    });

    it("o worker envia o assunto e o texto do motivo, sem {{ }} / { } sobrando e sem links com o token da participante", async () => {
      const cases: [number, string, string, string][] = [
        [0, "confirmed_cancelled", "cancelou a mentoria das", "O horário voltou a ficar livre na sua agenda"],
        [2, "invite_declined", "recusou o convite", "você pode convidar outra pessoa da fila"],
        [4, "invite_cancelled", "cancelou a inscrição e o convite", "você pode convidar outra pessoa da fila"],
      ];
      const { n } = await run();
      for (const [i, reason] of cases) {
        const appt = await apptOf(i);
        const horario = horarioOf(appt.startAt);
        const table = (await c.tables.findOne({ _id: appt.tableId }))!;
        const mesa = table.name ?? `Mesa ${table.number}`;
        const m = mentee(i).doc;
        const sent = n.sent.filter((s: any) => s.type === "mentor_slot_released" && (s.to === mentor(0).email || s.to === MENTOR_PHONE) && s.idempotencyKey.includes(String(appt._id)));
        const email = sent.find((s: any) => s.channel === "email");
        const wa = sent.find((s: any) => s.channel === "whatsapp");
        expect(email, `e-mail ${reason}`).toBeTruthy();
        expect(wa, `WhatsApp ${reason}`).toBeTruthy();
        const subjects: Record<string, string> = {
          confirmed_cancelled: `${m.name} cancelou a mentoria das ${horario}`,
          invite_declined: `${m.name} recusou o convite das ${horario}`,
          invite_cancelled: `Convite das ${horario} encerrado`,
        };
        expect(email.subject).toBe(subjects[reason]);
        expect(email.html).toContain("PARA MENTORAS");
        expect(email.html).toContain(`Seu horário das ${horario} ficou livre`);
        expect(email.html).toContain("Abrir minha agenda");
        expect(email.html).toContain(`href="${BASE}/entrar"`);
        expect(email.text).toContain("O horário já aparece livre no seu painel.");
        const texts: Record<string, string> = {
          confirmed_cancelled: `Oi, ${mentor(0).name}. ${m.name} cancelou a mentoria das ${horario} na ${mesa}. O horário voltou a ficar livre na sua agenda: ${BASE}/entrar`,
          invite_declined: `Oi, ${mentor(0).name}. ${m.name} recusou o convite para as ${horario}. O horário voltou a ficar livre e você pode convidar outra pessoa da fila: ${BASE}/entrar`,
          invite_cancelled: `Oi, ${mentor(0).name}. ${m.name} cancelou a inscrição e o convite para as ${horario} foi encerrado. O horário voltou a ficar livre e você pode convidar outra pessoa da fila: ${BASE}/entrar`,
        };
        expect(wa.text).toBe(texts[reason]);
        expect(wa.list).toBeUndefined();
        expect(email.text).toContain(texts[reason]!.replace(`: ${BASE}/entrar`, ".").replace(`Oi, ${mentor(0).name}. `, ""));
        for (const s of [email.subject, email.text, email.html, wa.text]) {
          expect(s).not.toMatch(/\{\{|\{[a-z_]+\}/);
          expect(s).not.toMatch(/\/l\/[0-9A-Za-z]{7}|\?t=/);
        }
      }
      for (const i of [0, 1, 2, 3, 4, 5]) for (const o of await itemsOf((await apptOf(i))._id)) expect(o.status).toBe("sent");
      // o aviso à mentora nunca carrega a participante como destinatária
      expect(await c.outbox.countDocuments({ type: TYPE, menteeId: { $ne: null } as never })).toBe(0);
    });

    it("mentora (E26) ou admin (E36) cancelando e convite expirado: nenhum aviso à mentora", async () => {
      expect((await b.invite(0, 6, 6, 6)).status).toBe(201);
      await act(6, { action: "accept" });
      const a6 = await apptOf(6);
      expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${a6._id}`, { action: "cancel" })).status).toBe(200);
      expect((await b.invite(0, 7, 7, 7)).status).toBe(201);
      const a7 = await apptOf(7);
      expect((await b.admin.patch(`/api/admin/mentees/${mentee(7).doc._id}`, { action: "cancel" })).status).toBe(200);
      expect((await b.invite(0, 8, 8, 8)).status).toBe(201);
      const a8 = await apptOf(8);
      expect((await api!.expireInvites!(b.t.db, b.t.client, min(a8.expiresAt!, 1))).expired).toBeGreaterThan(0);
      expect((await c.appointments.findOne({ _id: a8._id }))!.status).toBe("expired");
      for (const a of [a6, a7, a8]) expect(await itemsOf(a._id)).toHaveLength(0);
    });

    it("'Não vou' no WhatsApp (RN18): a participante só recebe o e-mail do slot_released; a mentora, e-mail + WhatsApp", async () => {
      expect((await b.invite(0, 9, 8, 9)).status).toBe(201);
      await act(9, { action: "accept" });
      const appt = await apptOf(9);
      const start = await startOf(8);
      // o lembrete de 15 min sai pelo WAHA como List Message e abre o pedido de presença
      await run(min(start, -14));
      expect((await c.presenceChecks.findOne({ _id: appt._id }))!.status).toBe("pending");
      b.clock.now = min(start, -13);
      const { status } = await inbound(mentee(9).doc.phone!, "Não poderei ir", `cancelar:${appt._id}`);
      expect(status).toBe(200);
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
      const menteeItems = await c.outbox.find({ type: "slot_released", appointmentId: appt._id }).toArray();
      expect(menteeItems.map((o) => o.channel)).toEqual(["email"]);
      await expectMentorNotice(appt._id, 0, "confirmed_cancelled", ["email", "whatsapp"]);
    });

    it("E47: mensagem vinda do WhatsApp da mentora não acha pedido pendente e não dispara nada", async () => {
      const before = await c.outbox.countDocuments({});
      const statuses = await c.appointments.find({}).project({ status: 1 }).toArray();
      for (const body of ["sim", "não"]) {
        const { status } = await inbound(MENTOR_PHONE, body);
        expect(status).toBe(200);
      }
      expect(await c.outbox.countDocuments({})).toBe(before);
      expect(await c.appointments.find({}).project({ status: 1 }).toArray()).toEqual(statuses);
    });
  });
});
