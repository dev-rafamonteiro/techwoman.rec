import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** RN19 (trocar de horário: E04 `reschedule`, E07, E08). O worker não roda aqui; só a fila é conferida. */
const api = await loadApi();
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN19 troca de horário", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!;
  const accept = async (i: number) => {
    const r = await Client.asMentee(b.app, mentee(i).token).post("/api/public/me/actions", { action: "accept" });
    expect(r.status).toBe(200);
  };
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;

  beforeAll(async () => {
    b = await bootApi(api!, "troca-horario", { mentors: 2, mentees: 10 });
    c = getCollections(b.t.db);
    // evento antigo (antes de 2026-11-05) com regras de lembrete pelo WhatsApp: viram e-mail
    await c.events.updateOne({}, { $set: { reminders: [
      { minutesBefore: 30, channels: ["whatsapp"] },
      { minutesBefore: 15, channels: ["whatsapp"] },
      { minutesBefore: 5, channels: ["whatsapp"] },
    ] as never } });
    // a mentora 0 já tem uma mentoria ativa no s09 (conta no desempate de E08)
    expect((await b.invite(0, 0, 8, 0)).status).toBe(201);
    await accept(0);
  });
  afterAll(async () => b?.close());

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
      expect((await b.invite(1, 3, 10, 2)).status).toBe(201);
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
      b.clock.now = min(S[2]!.startAt, -5); // s03 em 5 min: fora (antecedência mínima de 10)
      await c.mentees.updateOne({ _id: mentee(3).doc._id }, { $set: { preferredPeriod: "morning" } });
      await c.users.updateMany({ _id: { $in: [mt0!, mt1!] } }, { $set: { availability: ["s03", "s04", "s05", "s06", "s07"] } });

      const r = await m3().get("/api/public/me/slots");
      expect(r.status).toBe(200);
      expect(r.body.items.map((s: any) => s.slotId)).toEqual(["s04", "s05", "s06", "s07"]);
      expect(r.body.items.find((s: any) => s.slotId === "s04").matchesPeriod).toBe(true); // 11:15
      expect(r.body.items.find((s: any) => s.slotId === "s05").matchesPeriod).toBe(false); // 12:00
      expect(r.body.items[0]).toMatchObject({ startAt: S[3]!.startAt.toISOString(), endAt: S[3]!.endAt.toISOString() });

      // s05: mentora 0 ocupada (convite ativo) e a 1 sem disponibilidade; s07 só a 0
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
      expect(out.filter((o) => o.type === "confirmed").map((o) => o.channel)).toEqual(["email"]);
      // regras antigas com `whatsapp` (beforeAll): os lembretes saem por e-mail
      const rem = out.filter((o) => o.type === "reminder").sort((x, y) => x.nextAttemptAt.getTime() - y.nextAttemptAt.getTime());
      expect(rem.map((o) => [o.payload["minutesBefore"], o.channel])).toEqual([[30, "email"], [15, "email"], [5, "email"]]);

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
