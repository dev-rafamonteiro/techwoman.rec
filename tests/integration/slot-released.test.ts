import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * PLAN, Notificações: horário liberado pela própria participante, que volta à fila com prioridade (E04 `decline` com
 * motivo `schedule`, E04 `reschedule` de P6) -> `slot_released` por e-mail (layout 8), dedupe
 * `slot_released:<appointmentId>`. Mentora/admin cancelando não dispara.
 * O worker usa o MemoryNotifier (nada sai de verdade).
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const WORKER_CONFIG = { publicBaseUrl: BASE };

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("slot_released · horário liberado pela participante", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!;
  const asMentee = (i: number) => Client.asMentee(b.app, mentee(i).token);
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const items = (i: number) => c.outbox.find({ type: "slot_released" as never, menteeId: mentee(i).doc._id }).sort({ channel: 1 }).toArray();
  const fresh = async (i: number) => (await c.mentees.findOne({ _id: mentee(i).doc._id }))!;
  const run = async (now = b.clock.now) => {
    const n = new api!.MemoryNotifier!();
    const res = await api!.processOutbox!(b.t.db, { notifier: n, now, config: WORKER_CONFIG });
    return { n, res };
  };
  const accept = async (i: number) => expect((await asMentee(i).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
  /** Um item pendente, só por e-mail, com a dedupeKey `slot_released:<appointmentId>:email`. */
  const expectEnqueued = async (i: number, appointmentId: unknown) => {
    const m = await fresh(i);
    expect(m).toMatchObject({ status: "waiting", priority: true, priorityReason: "declined_schedule" });
    const out = await items(i);
    expect(out.map((o) => o.channel)).toEqual(["email"]);
    expect(out[0]).toMatchObject({ status: "pending", to: m.email, menteeId: m._id, appointmentId, dedupeKey: `slot_released:${appointmentId}:email` });
  };
  beforeAll(async () => {
    b = await bootApi(api!, "horario-liberado", { mentors: 2, mentees: 6 });
    c = getCollections(b.t.db);
  });
  afterAll(async () => b?.close());

  it("convite -> recusa 'Horário não serve' (decline_schedule): enfileira o e-mail", async () => {
    expect((await b.invite(0, 0, 6, 0)).status).toBe(201);
    const appt = await apptOf(0);
    const r = await asMentee(0).post("/api/public/me/actions", { action: "decline", reason: "schedule" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("declined");
    await expectEnqueued(0, appt._id);
  });

  it("confirmada -> 'Trocar de horário' em P6 (mentee_reschedule): enfileira o e-mail", async () => {
    expect((await b.invite(1, 1, 6, 1)).status).toBe(201);
    await accept(1);
    const appt = await apptOf(1);
    const r = await asMentee(1).post("/api/public/me/actions", { action: "reschedule" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
    await expectEnqueued(1, appt._id);
    // nem `cancelled` (aviso da mentora) nem `registration_cancelled`
    expect(await c.outbox.countDocuments({ type: { $in: ["cancelled", "registration_cancelled"] as never[] }, menteeId: mentee(1).doc._id })).toBe(0);
  });

  it("o worker envia o e-mail do layout 8 com o link curto de P6", async () => {
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
    }
    expect(n.sent.every((s: any) => s.channel === "email")).toBe(true);
    for (const i of [0, 1]) for (const o of await items(i)) expect(o.status).toBe("sent");
  });

  it("se ela já não está na fila (novo convite) antes do envio, os itens viram skipped e nada sai", async () => {
    expect((await b.invite(1, 3, 7, 1)).status).toBe(201);
    expect((await asMentee(3).post("/api/public/me/actions", { action: "decline", reason: "schedule" })).status).toBe(200);
    expect(await items(3)).toHaveLength(1);
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
});
