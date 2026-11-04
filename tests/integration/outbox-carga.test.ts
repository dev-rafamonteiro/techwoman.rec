import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { RateLimiter } from "../../src/api/worker/rate-limit.js";
import { RateLimitError } from "../../src/api/worker/notifier.js";

/**
 * Teste de carga da outbox (lento: só com TW_LOAD=1). Provedor falso com o limite do Resend em escala 10x
 * (100/s em vez de 10/s) e o worker a 80/s (8/s em escala). Ondas de inscrição chegando enquanto a fila anda.
 *   TW_LOAD=1 npm run test:integration -- outbox-carga
 */
const api = await loadApi();
const N = Number(process.env.TW_LOAD_N ?? 3000);
const PROVIDER_PER_SEC = 100;
/** Latência do provedor em escala: com envio um por vez, 30 ms seguraria o ritmo em ~30/s. */
const LATENCY_MS = 30;

class FakeResend {
  sent = 0;
  limited = 0;
  private window: number[] = [];
  async send() {
    const now = Date.now();
    this.window = this.window.filter((t) => now - t < 1000);
    await new Promise((r) => setTimeout(r, LATENCY_MS)); // latência da API
    if (this.window.length >= PROVIDER_PER_SEC) {
      this.limited++;
      throw new RateLimitError("HTTP 429 rate_limit_exceeded", 1000 - (now - this.window[0]!));
    }
    this.window.push(now);
    this.sent++;
  }
}

describe.skipIf(!process.env.TW_LOAD || !api?.processOutbox)(`carga da outbox: ${N} e-mails em ondas`, () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "outbox-carga", { mentors: 1, mentees: 1 });
  });
  afterAll(async () => b?.close());

  const run = async (label: string, limiters: Record<string, RateLimiter> | undefined, concurrency = 1) => {
    const c = b.t.db.collection("outbox");
    await c.deleteMany({});
    const doc = (i: number) => ({
      eventId: "techwoman-2026", channel: "email", type: "registered", to: `carga${i}@exemplo.test`, menteeId: b.w.mentees[0]!.doc._id, userId: null, appointmentId: null,
      payload: {}, status: "pending", attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lockedBy: null, sentAt: null, lastError: null,
      dedupeKey: `registered:carga:${label}:${i}`, createdAt: new Date(),
    });
    const provider = new FakeResend();
    const t0 = Date.now();
    // 3 ondas: metade agora, um quarto em 3 s, um quarto em 6 s
    const waves = [[0, N / 2], [3000, N / 4], [6000, N / 4]] as const;
    let inserted = 0;
    const feeding = Promise.all(waves.map(async ([at, n], w) => {
      await new Promise((r) => setTimeout(r, at));
      const start = waves.slice(0, w).reduce((s, x) => s + x[1], 0);
      await c.insertMany(Array.from({ length: n }, (_, i) => doc(start + i)) as never);
      inserted += n;
    }));
    // laço do worker (o real roda a cada 2 s; aqui sem pausa para medir o teto)
    while (inserted < N || (await c.countDocuments({ status: { $in: ["pending", "sending"] } })) > 0) {
      await api!.processOutbox!(b.t.db, { notifier: provider, now: new Date(), concurrency: { email: concurrency }, ...(limiters ? { limiters } : {}) } as never);
      if (Date.now() - t0 > 10 * 60_000) throw new Error("fila não esvaziou em 10 min");
    }
    await feeding;
    const secs = (Date.now() - t0) / 1000;
    const failed = await c.countDocuments({ status: "failed" });
    const maxAttempts = (await c.find({}).sort({ attempts: -1 }).limit(1).next())?.attempts;
    console.log(`[carga] ${label}: ${provider.sent} enviados em ${secs.toFixed(1)} s (${(provider.sent / secs).toFixed(0)}/s), 429 do provedor: ${provider.limited}, failed: ${failed}, máx. tentativas: ${maxAttempts}`);
    return { sent: provider.sent, limited: provider.limited, failed, maxAttempts };
  };

  it("com o limitador do worker (80/s contra 100/s do provedor) e 4 envios simultâneos: tudo sai no ritmo, quase nenhum 429", async () => {
    const r = await run("com-limitador", { email: new RateLimiter(80) }, 4);
    expect(r.sent).toBe(N);
    expect(r.failed).toBe(0);
    expect(r.limited).toBeLessThan(N * 0.01);
  }, 15 * 60_000);

  it("sem limitador e com 8 envios simultâneos: o provedor devolve 429, mas nenhum e-mail vira failed nem gasta tentativa", async () => {
    const r = await run("sem-limitador", undefined, 8);
    expect(r.sent).toBe(N);
    expect(r.failed).toBe(0);
    expect(r.maxAttempts).toBe(1);
  }, 15 * 60_000);
});
