import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** A7 · lembretes configuráveis: a confirmação real agenda um item na fila por regra, e o worker envia cada um no horário. */
const api = await loadApi();
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("lembretes configuráveis (A7)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "lembretes", { mentors: 1, mentees: 2 });
    await getCollections(b.t.db).events.updateOne({}, { $set: { reminders: [
      { minutesBefore: 30, channels: ["email", "whatsapp"] },
      { minutesBefore: 15, channels: ["email"] },
      { minutesBefore: 5, channels: ["whatsapp"] },
    ] } });
  });
  afterAll(async () => b?.close());

  it("confirmar agenda 30, 15 e 5 min antes; WhatsApp desligado cai para e-mail; cada um sai no seu horário", async () => {
    expect((await b.invite(0, 0, 8, 2)).status).toBe(201);
    expect((await Client.asMentee(b.app, b.w.mentees[0]!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const start = (await getCollections(b.t.db).events.findOne({}))!.slots[8]!.startAt;
    const rem = await b.t.db.collection("outbox").find({ type: "reminder", menteeId: b.w.mentees[0]!.doc._id }).sort({ nextAttemptAt: 1 }).toArray();
    expect(rem.map((r) => [r.payload.minutesBefore, r.channel, r.nextAttemptAt.getTime()])).toEqual([
      [30, "email", min(start, -30).getTime()],
      [15, "email", min(start, -15).getTime()],
      [5, "email", min(start, -5).getTime()],
    ]);
    expect(new Set(rem.map((r) => r.dedupeKey)).size).toBe(3);

    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -29) });
    expect(n.sent.filter((m: any) => m.type === "reminder")).toHaveLength(1);
    await api!.processOutbox!(b.t.db, { notifier: n, now: min(start, -4) });
    expect(n.sent.filter((m: any) => m.type === "reminder")).toHaveLength(3);
  });
});
