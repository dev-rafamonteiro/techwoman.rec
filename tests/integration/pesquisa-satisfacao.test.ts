import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * Pesquisa de satisfação (`feedback_request`, layout 16): entra na fila quando a mentoria é concluída, sai no fim da
 * sessão (início + duração) e só se, na hora, ela seguir concluída e a participante ainda não tiver avaliado.
 * Cancelada ou remarcada nunca é concluída, então não recebe.
 */
const api = await loadApi();
const BASE = "https://techwoman.test";
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("pesquisa de satisfação no fim da sessão", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!.doc;
  const book = async (i: number, slotIdx: number) => {
    const r = await b.admin.post("/api/admin/appointments", {
      menteeId: String(mentee(i)._id), mentorId: String(b.w.mentors[0]!._id), slotId: b.w.slotIds[slotIdx]!, tableId: String(b.w.tables[i]!._id), ignoreLeadTime: true, confirmNow: true,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return (await c.appointments.findOne({ menteeId: mentee(i)._id, status: "confirmed" }))!;
  };
  const finish = async (id: unknown) => {
    const r = await b.mentor[0]!.patch(`/api/mentor/appointments/${id}`, { action: "finish" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  };
  const send = async (at: Date) => {
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: at, config: { publicBaseUrl: BASE } });
    return n.sent.filter((s: any) => s.type === "feedback_request") as any[];
  };
  const itemOf = async (i: number) => c.outbox.findOne({ type: "feedback_request" as never, menteeId: mentee(i)._id });

  beforeAll(async () => {
    b = await bootApi(api!, "pesquisa", { mentors: 1, mentees: 5 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => b?.close());

  it("concluída antes do fim: espera o fim da sessão e então sai com a mentora e o link pessoal", async () => {
    const a = await book(0, 0);
    b.clock.now = min(a.startAt, 20);
    await finish(a._id);
    expect((await itemOf(0))!.nextAttemptAt.getTime()).toBe(a.endAt.getTime());
    expect(await send(min(a.endAt, -1))).toHaveLength(0);
    const sent = await send(a.endAt);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(mentee(0).email);
    expect(sent[0].subject).toContain(b.w.mentors[0]!.name);
    expect(sent[0].text).toContain(BASE);
  });

  it("concluída depois do fim: sai na hora", async () => {
    const a = await book(1, 1);
    b.clock.now = min(a.endAt, 10);
    await finish(a._id);
    expect(await send(b.clock.now)).toHaveLength(1);
  });

  it("cancelada (devolvida à fila) não entra na fila da pesquisa", async () => {
    const a = await book(2, 2);
    b.clock.now = min(a.startAt, 5);
    expect((await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "cancel" })).status).toBe(200);
    expect(await itemOf(2)).toBeNull();
  });

  it("reaberta antes do envio (RN23): descartada", async () => {
    const a = await book(3, 3);
    b.clock.now = min(a.startAt, 20);
    await finish(a._id);
    expect((await b.superAdmin.patch(`/api/admin/appointments/${a._id}`, { action: "reopen" })).status).toBe(200);
    expect(await send(a.endAt)).toHaveLength(0);
    expect((await itemOf(3))!.status).toBe("skipped");
  });

  it("já avaliou antes do envio: descartada", async () => {
    const a = await book(4, 4);
    b.clock.now = min(a.startAt, 20);
    await finish(a._id);
    await c.feedbacks.insertOne({ _id: mentee(4)._id, eventId: a.eventId, mentorId: a.mentorId, ratings: {}, comment: null, createdAt: b.clock.now } as never);
    expect(await send(a.endAt)).toHaveLength(0);
    expect((await itemOf(4))!.lastError).toBe("participante já avaliou");
  });
});
