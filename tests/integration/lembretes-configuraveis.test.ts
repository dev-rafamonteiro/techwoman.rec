import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * A7 · lembretes configuráveis (sempre por e-mail): a confirmação real agenda um item na fila por regra, e o worker
 * envia cada um no horário. O evento aqui imita um documento antigo do Atlas (antes de 2026-11-05): regras com o canal
 * `whatsapp` e os campos `whatsappLists`/`templates` dos menus e textos do WhatsApp. Nada disso pode quebrar a leitura.
 */
const api = await loadApi();
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const LEGACY_REMINDERS = [
  { minutesBefore: 30, channels: ["email", "whatsapp"] },
  { minutesBefore: 15, channels: ["email"] },
  { minutesBefore: 5, channels: ["whatsapp"] },
];
const LEGACY_LISTS = { invite: { title: "Oi {nome}", description: "Convite às {horario}" }, presence: { title: "Oi {nome}", description: "Faltam {minutos} min" } };

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("lembretes configuráveis (A7)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  beforeAll(async () => {
    b = await bootApi(api!, "lembretes", { mentors: 1, mentees: 2 });
    c = getCollections(b.t.db);
    await c.events.updateOne({}, { $set: { reminders: LEGACY_REMINDERS as never, whatsappLists: LEGACY_LISTS } });
  });
  afterAll(async () => b?.close());

  it("confirmar agenda 30, 15 e 5 min antes, todos por e-mail (inclusive as regras antigas com `whatsapp`); cada um sai no seu horário", async () => {
    expect((await b.invite(0, 0, 8, 2)).status).toBe(201);
    expect((await Client.asMentee(b.app, b.w.mentees[0]!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const start = (await c.events.findOne({}))!.slots[8]!.startAt;
    const rem = await c.outbox.find({ type: "reminder", menteeId: b.w.mentees[0]!.doc._id }).sort({ nextAttemptAt: 1 }).toArray();
    expect(rem.map((r) => [r.payload["minutesBefore"], r.channel, r.to, r.nextAttemptAt.getTime()])).toEqual([
      [30, "email", b.w.mentees[0]!.doc.email, min(start, -30).getTime()],
      [15, "email", b.w.mentees[0]!.doc.email, min(start, -15).getTime()],
      [5, "email", b.w.mentees[0]!.doc.email, min(start, -5).getTime()],
    ]);
    expect(new Set(rem.map((r) => r.dedupeKey)).size).toBe(3);
    expect(rem.every((r) => r.payload["presenceCheck"] === undefined)).toBe(true);

    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -29) });
    expect(n.sent.filter((m: any) => m.type === "reminder")).toHaveLength(1);
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -4) });
    const sent = n.sent.filter((m: any) => m.type === "reminder");
    expect(sent).toHaveLength(3);
    expect(sent.every((m: any) => m.channel === "email")).toBe(true);
  });

  it("lembrete antigo só no WhatsApp ainda na fila (antes de 2026-11-05): ganha cópia no e-mail no mesmo horário e sai", async () => {
    const mentee = b.w.mentees[1]!;
    expect((await b.invite(0, 1, 10, 2)).status).toBe(201);
    expect((await Client.asMentee(b.app, mentee.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const start = (await c.events.findOne({}))!.slots[10]!.startAt;
    // imita a fila gravada pelo código antigo: 30 min nos dois canais, 5 min só no WhatsApp (sem item no e-mail)
    const rows = await c.outbox.find({ type: "reminder", menteeId: mentee.doc._id }).toArray();
    const r30 = rows.find((r) => r.payload["minutesBefore"] === 30)!;
    const r5 = rows.find((r) => r.payload["minutesBefore"] === 5)!;
    const wa = (r: typeof r30) => ({ ...r, _id: new (r._id.constructor as any)(), channel: "whatsapp" as const, to: "+5581999990000", payload: { ...r.payload, presenceCheck: true }, dedupeKey: r.dedupeKey.replace(/:email$/, ":whatsapp") });
    await c.outbox.insertMany([wa(r30), wa(r5)]);
    await c.outbox.deleteOne({ _id: r5._id });

    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -60) });
    expect(n.sent.filter((m: any) => m.type === "reminder")).toHaveLength(0);
    const after = await c.outbox.find({ type: "reminder", menteeId: mentee.doc._id }).sort({ nextAttemptAt: 1, channel: 1 }).toArray();
    expect(after.map((r) => [r.payload["minutesBefore"], r.channel, r.status, r.nextAttemptAt.getTime()])).toEqual([
      [30, "email", "pending", min(start, -30).getTime()],
      [undefined, "whatsapp", "skipped", min(start, -30).getTime()],
      [15, "email", "pending", min(start, -15).getTime()],
      [5, "email", "pending", min(start, -5).getTime()],
      [undefined, "whatsapp", "skipped", min(start, -5).getTime()],
    ]);
    // o item do WhatsApp descartado perde o payload (como todo item de canal desligado)
    const copy = after.find((r) => r.payload["minutesBefore"] === 5 && r.channel === "email")!;
    expect(copy).toMatchObject({ to: mentee.doc.email, attempts: 0, dedupeKey: r5.dedupeKey });
    expect(copy.payload).toEqual({ minutesBefore: 5 });

    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -4) });
    const sent = n.sent.filter((m: any) => m.type === "reminder");
    expect(sent).toHaveLength(3);
    expect(sent.every((m: any) => m.channel === "email")).toBe(true);
  });

  it("E41 GET com o evento antigo: 200, lembretes devolvidos só com e-mail, sem whatsappLists nem templates", async () => {
    const r = await b.superAdmin.get("/api/admin/event");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.event.reminders).toEqual(LEGACY_REMINDERS.map((x) => ({ minutesBefore: x.minutesBefore, channels: ["email"] })));
    expect(r.body.event).not.toHaveProperty("whatsappLists");
    expect(r.body.event).not.toHaveProperty("templates");
  });

  it("E41 PUT de uma aba antiga (com `whatsapp` e whatsappLists): grava os lembretes só com e-mail e tira whatsappLists do evento", async () => {
    const { event } = (await b.superAdmin.get("/api/admin/event")).body;
    const { id: _id, slots: _slots, ...rest } = event;
    const r = await b.superAdmin.put("/api/admin/event", { ...rest, reminders: [{ minutesBefore: 20, channels: ["whatsapp"] }, { minutesBefore: 10, channels: ["email", "whatsapp"] }], whatsappLists: LEGACY_LISTS });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.event.reminders).toEqual([{ minutesBefore: 20, channels: ["email"] }, { minutesBefore: 10, channels: ["email"] }]);
    const doc = (await c.events.findOne({}))!;
    expect(doc.reminders).toEqual([{ minutesBefore: 20, channels: ["email"] }, { minutesBefore: 10, channels: ["email"] }]);
    expect(doc).not.toHaveProperty("whatsappLists");
  });
});
