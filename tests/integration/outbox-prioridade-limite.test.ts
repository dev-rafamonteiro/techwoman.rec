import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { RateLimiter } from "../../src/api/worker/rate-limit.js";
import { RateLimitError } from "../../src/api/worker/notifier.js";

const api = await loadApi();

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("worker: prioridade, limite do provedor (429) e canais separados", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "worker-limite", { mentors: 2, mentees: 6 });
  });
  afterAll(async () => b?.close());

  const outbox = () => b.t.db.collection("outbox");
  const mk = () => new api!.MemoryNotifier!() as any;
  const base = (i: number, extra: Record<string, unknown> = {}) => ({
    eventId: "techwoman-2026", channel: "email", type: "registered", to: `fila${i}@exemplo.test`, menteeId: b.w.mentees[5]!.doc._id, userId: null, appointmentId: null,
    payload: {}, status: "pending", attempts: 0, nextAttemptAt: new Date(0), lockedAt: null, lockedBy: null, sentAt: null, lastError: null,
    dedupeKey: `registered:fila:${i}:${extra["channel"] ?? "email"}`, createdAt: new Date(), ...extra,
  });
  const drain = async () => {
    // limpa o que sobrou de outros testes antes de cada cenário
    await api!.processOutbox!(b.t.db, { notifier: mk(), now: b.clock.now });
    await outbox().deleteMany({});
  };

  it("fila acumulada: o convite sai antes das inscrições recebidas mais antigas", async () => {
    await drain();
    await outbox().insertMany(Array.from({ length: 20 }, (_, i) => base(i)) as never);
    expect((await b.invite(0, 0, 3, 0)).status).toBe(201);
    const n = mk();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    const types = n.sent.map((m: any) => m.type);
    expect(types[0]).toBe("invite");
    expect(types.filter((t: string) => t === "registered")).toHaveLength(20);
  });

  it("429: volta para a fila sem gastar tentativa, espera o Retry-After e pausa só o canal de e-mail", async () => {
    await drain();
    await outbox().insertMany([base(100), base(101), base(102), base(103, { channel: "whatsapp", to: "+5581999990000" })] as never);
    // 429 só no 1º e-mail (os canais rodam em paralelo; o WhatsApp não pode levar o 429 no lugar)
    const n = mk();
    let hits = 0;
    const send = n.send.bind(n);
    n.send = async (m: any) => {
      if (m.channel === "email" && hits++ === 0) throw new RateLimitError("HTTP 429 limite simulado", 5_000);
      return send(m);
    };
    const limiters = { email: new RateLimiter(100), whatsapp: new RateLimiter(100) };
    const r = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, limiters } as never);
    expect((r as any).rateLimited).toBe(1);
    const limited = (await outbox().find({ channel: "email", status: "pending" }).toArray());
    // o 1º levou 429; os outros dois nem foram tentados porque o canal ficou pausado
    expect(limited).toHaveLength(3);
    const hit = limited.find((d) => d.lastError)!;
    expect(hit.attempts).toBe(0);
    expect(hit.lastError).toMatch(/429/);
    expect(hit.nextAttemptAt.getTime() - b.clock.now.getTime()).toBe(5_000);
    expect(limiters.email.isPaused()).toBe(true);
    // WhatsApp não para por causa do e-mail
    expect(n.sent.filter((m: any) => m.channel === "whatsapp")).toHaveLength(1);
  });

  it("muitos 429 seguidos nunca viram failed; quando o provedor libera, tudo sai", async () => {
    await drain();
    await outbox().insertOne(base(200) as never);
    const n = mk();
    n.rateLimitNext(20, 1_000);
    let now = b.clock.now;
    for (let i = 0; i < 20; i++) {
      await api!.processOutbox!(b.t.db, { notifier: n, now });
      now = new Date(now.getTime() + 1_001);
    }
    const d = (await outbox().findOne({ to: "fila200@exemplo.test" }))!;
    expect(d.status).toBe("pending");
    expect(d.attempts).toBe(0);
    await api!.processOutbox!(b.t.db, { notifier: n, now });
    expect((await outbox().findOne({ _id: d._id }))!.status).toBe("sent");
  });

  it("limitador: com 10/s, 25 e-mails não saem todos de uma vez", async () => {
    await drain();
    await outbox().insertMany(Array.from({ length: 25 }, (_, i) => base(300 + i)) as never);
    const n = mk();
    const t0 = Date.now();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, limiters: { email: new RateLimiter(10) } } as never);
    expect(n.sent).toHaveLength(25);
    // 10 de saída + 15 a 100 ms cada = ~1,5 s
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1_300);
  });

  it("E44 health (A9): conta o que está na fila por canal e acusa atraso", async () => {
    await drain();
    const old = new Date(b.clock.now.getTime() - 10 * 60_000);
    await outbox().insertMany([
      base(400, { nextAttemptAt: old, lastError: "HTTP 429 limite" }),
      base(401),
      base(402, { nextAttemptAt: new Date(b.clock.now.getTime() + 60 * 60_000) }),
      base(403, { status: "failed" }),
    ] as never);
    const r = await b.admin.get("/api/admin/notifications/health");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const email = r.body.channels.find((c: any) => c.channel === "email");
    expect(email).toMatchObject({ due: 2, scheduled: 1, failed: 1, rateLimited: true });
    expect(email.oldestDueSeconds).toBeGreaterThan(r.body.alertAfterSeconds);
    expect(r.body.ok).toBe(false);
    expect((await b.mentor[0]!.get("/api/admin/notifications/health")).status).toBe(403);
  });
});
