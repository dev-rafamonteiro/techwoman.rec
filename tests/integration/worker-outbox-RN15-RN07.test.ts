import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

const api = await loadApi();
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const BACKOFF = [30_000, 60_000, 120_000, 240_000, 480_000];

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier || !api?.expireInvites)("worker: outbox, tentativas, RN15 lembrete, RN07 expiração (PLAN: Notificações)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "worker", { mentors: 2, mentees: 6 });
  });
  afterAll(async () => b?.close());

  const outbox = () => b.t.db.collection("outbox");
  const mk = () => new api!.MemoryNotifier!();

  it("invite: e-mail enviado pelo worker, status sent, payload apagado, canal sem provedor = skipped", async () => {
    expect((await b.invite(0, 0, 3, 0)).status).toBe(201);
    const n = mk();
    const r = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    expect(r.sent).toBeGreaterThan(0);
    const sent = n.sent.find((m: any) => m.type === "invite");
    expect(sent.channel).toBe("email");
    expect(sent.to).toBe(b.w.mentees[0]!.doc.email);
    // link pessoal de P6 sai curto (E48): /l/<código>, não o link longo com o token
    expect(sent.text).toMatch(/http\S+\/l\/[0-9A-Za-z]{7}/);
    expect(sent.text).not.toContain("/mentoria/minha?t=");
    const items = await outbox().find({ type: "invite" }).toArray();
    for (const it of items) {
      expect(["sent", "skipped"]).toContain(it.status);
      expect(it.dedupeKey).toMatch(/^invite:[0-9a-f]{24}:(email|whatsapp)$/);
    }
    // rodar de novo não reenvia
    const again = mk();
    await api!.processOutbox!(b.t.db, { notifier: again, now: b.clock.now });
    expect(again.sent.filter((m: any) => m.type === "invite")).toHaveLength(0);
  });

  it("falha: 1 envio + 5 reenvios com esperas de 30 s, 1, 2, 4 e 8 min; depois failed (A9)", async () => {
    // mensagem 'registered' (não depende de convite ativo; um 'invite' seria descartado ao vencer o prazo, RN05)
    await outbox().insertOne({ eventId: "techwoman-2026", channel: "email", type: "registered", to: "retry@exemplo.test", menteeId: b.w.mentees[1]!.doc._id, userId: null, appointmentId: null, payload: {}, status: "pending", attempts: 0, nextAttemptAt: new Date(0), lockedAt: null, lockedBy: null, sentAt: null, lastError: null, dedupeKey: "registered:retry:1:email", createdAt: new Date() } as never);
    const n = mk();
    n.failNext(100);
    let now = b.clock.now;
    const doc = async () => (await outbox().findOne({ to: "retry@exemplo.test" }))!;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await api!.processOutbox!(b.t.db, { notifier: n, now });
      const d = await doc();
      expect(d.attempts, `tentativa ${attempt}`).toBe(attempt);
      if (attempt < 6) {
        expect(d.status).toBe("pending");
        const wait = d.nextAttemptAt.getTime() - now.getTime();
        expect(wait).toBeGreaterThanOrEqual(BACKOFF[attempt - 1]!);
        expect(wait).toBeLessThanOrEqual(BACKOFF[attempt - 1]! * 1.11);
        // antes do prazo não é pego
        const early = await api!.processOutbox!(b.t.db, { notifier: n, now: new Date(now.getTime() + 1000) });
        expect(early.failed + early.retried).toBe(0);
        now = new Date(d.nextAttemptAt.getTime() + 1);
        b.clock.now = now;
      } else {
        expect(d.status).toBe("failed");
        expect(d.lastError).toBeTruthy();
      }
    }
  });

  it("A9 E44: reenviar uma falha volta para pending e o worker envia", async () => {
    const failed = (await outbox().findOne({ status: "failed" }))!;
    const r = await b.admin.post(`/api/admin/notifications/${failed._id}/retry`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const n = mk();
    await api!.processOutbox!(b.t.db, { notifier: n, now: new Date(b.clock.now.getTime() + 60_000) });
    expect((await outbox().findOne({ _id: failed._id }))!.status).toMatch(/sent|skipped/);
  });

  it("falha permanente não tenta de novo (failed na 1ª)", async () => {
    expect((await b.invite(1, 2, 6, 2)).status).toBe(201);
    const n = mk();
    n.failNext(1, true);
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    const d = await outbox().findOne({ type: "invite", to: b.w.mentees[2]!.doc.email });
    expect(d!.status).toBe("failed");
    expect(d!.attempts).toBe(1);
  });

  it("dois workers ao mesmo tempo: cada mensagem é enviada uma única vez", async () => {
    const c = outbox();
    const base = { eventId: "techwoman-2026", channel: "email", type: "registered", menteeId: b.w.mentees[3]!.doc._id, userId: null, appointmentId: null, payload: {}, status: "pending", attempts: 0, nextAttemptAt: new Date(0), lockedAt: null, lockedBy: null, sentAt: null, lastError: null, createdAt: new Date() };
    await c.insertMany(Array.from({ length: 40 }, (_, i) => ({ ...base, to: `x${i}@exemplo.test`, dedupeKey: `registered:conc:${i}:email` })) as never);
    const [n1, n2, n3] = [mk(), mk(), mk()];
    await Promise.all([n1, n2, n3].map((n, i) => api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, workerId: `w${i}` })));
    const tos = [...n1.sent, ...n2.sent, ...n3.sent].filter((m: any) => m.to.startsWith("x") && m.to.endsWith("@exemplo.test")).map((m: any) => m.to);
    expect(tos).toHaveLength(40);
    expect(new Set(tos).size).toBe(40);
  });

  it("itens presos em sending há mais de 2 min voltam para pending e são enviados", async () => {
    const c = outbox();
    const d = (await c.findOne({ dedupeKey: "registered:conc:0:email" }))!;
    await c.updateOne({ _id: d._id }, { $set: { status: "sending", lockedAt: new Date(b.clock.now.getTime() - 3 * 60_000), lockedBy: "morto", sentAt: null } });
    const n = mk();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    expect(n.sent.some((m: any) => m.to === "x0@exemplo.test")).toBe(true);
  });

  it("RN15: lembrete agendado ao confirmar e DESCARTADO (skipped) se a mentoria foi cancelada antes do envio", async () => {
    const mi = 4;
    expect((await b.invite(0, mi, 8, 3)).status).toBe(201);
    const mc = Client.asMentee(b.app, b.w.mentees[mi]!.token);
    expect((await mc.post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const slotStart = (await getCollections(b.t.db).events.findOne({}))!.slots[8]!.startAt;
    const rem = await outbox().findOne({ type: "reminder", menteeId: b.w.mentees[mi]!.doc._id });
    expect(rem).toBeTruthy();
    expect(rem!.nextAttemptAt.getTime()).toBe(min(slotStart, -15).getTime()); // 15 min antes
    // a mentora cancela
    const appt = (await getCollections(b.t.db).appointments.findOne({ menteeId: b.w.mentees[mi]!.doc._id }))!;
    expect((await b.mentor[0]!.patch(`/api/mentor/appointments/${appt._id}`, { action: "cancel" })).status).toBe(200);
    const n = mk();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(slotStart, -14) });
    expect(n.sent.some((m: any) => m.type === "reminder")).toBe(false);
    expect((await outbox().findOne({ _id: rem!._id }))!.status).toBe("skipped");
    // RN10: a participante voltou à fila com prioridade e o horário/mesa estão livres
    const mentee = (await getCollections(b.t.db).mentees.findOne({ _id: b.w.mentees[mi]!.doc._id }))!;
    expect([mentee.status, mentee.priority, mentee.priorityReason]).toEqual(["waiting", true, "cancelled_by_staff"]);
    expect((await getCollections(b.t.db).appointments.findOne({ _id: appt._id }))!.slotLock).toBeUndefined();
  });

  it("RN15: lembrete de mentoria confirmada é enviado no horário", async () => {
    const mi = 5;
    expect((await b.invite(1, mi, 8, 4)).status).toBe(201);
    await Client.asMentee(b.app, b.w.mentees[mi]!.token).post("/api/public/me/actions", { action: "accept" });
    const slotStart = (await getCollections(b.t.db).events.findOne({}))!.slots[9]!.startAt;
    const n = mk();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(slotStart, -14) });
    expect(n.sent.filter((m: any) => m.type === "reminder")).toHaveLength(1);
  });

  it("RN07: expireInvites expira só convites vencidos, libera mesa/horário, participante waiting sem prioridade, aviso 'expired'", async () => {
    const { appointments, mentees } = getCollections(b.t.db);
    const invited = await appointments.find({ status: "invited" }).toArray();
    expect(invited.length).toBeGreaterThan(0);
    const early = await api!.expireInvites!(b.t.db, b.t.client, new Date(Math.min(...invited.map((a) => a.createdAt.getTime())) - 1000));
    expect(early.expired).toBe(0);
    const far = new Date(Math.max(...invited.map((a) => a.expiresAt!.getTime())) + 1000);
    const r = await api!.expireInvites!(b.t.db, b.t.client, far);
    expect(r.expired).toBe(invited.length);
    for (const a of invited) {
      const d = (await appointments.findOne({ _id: a._id }))!;
      expect(d.status).toBe("expired");
      expect(d.slotLock).toBeUndefined();
      expect(d.menteeLock).toBeUndefined();
      const m = (await mentees.findOne({ _id: a.menteeId }))!;
      expect([m.status, m.priority]).toEqual(["waiting", false]);
      expect(await outbox().countDocuments({ appointmentId: a._id, type: "expired" })).toBeGreaterThan(0);
    }
    expect((await api!.expireInvites!(b.t.db, b.t.client, far)).expired).toBe(0); // idempotente
    expect(await b.t.db.collection("audit_logs").countDocuments({ action: "appointment.expire" })).toBe(invited.length);
  });
});
