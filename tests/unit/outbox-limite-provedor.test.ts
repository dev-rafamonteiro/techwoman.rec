import { describe, expect, it } from "vitest";
import { OUTBOX_TYPES } from "@tw/shared";
import { RateLimiter, rateLimitersFromEnv } from "../../src/api/worker/rate-limit.js";
import { RateLimitError, retryAfterMs } from "../../src/api/worker/notifier.js";
import { PRIORITY_TIERS } from "../../src/api/worker/outbox.js";

describe("outbox: limite do provedor (Resend 10/s)", () => {
  it("balde: no máximo perSec envios por segundo, sem rajada acima disso", () => {
    let t = 0;
    const l = new RateLimiter(8, () => t);
    let ok = 0;
    while (l.waitMs() === 0) {
      (l as any).tokens -= 1;
      ok++;
    }
    expect(ok).toBe(8);
    expect(l.waitMs()).toBe(125); // 1 ficha a cada 1000/8 ms
    t += 1000;
    expect(l.waitMs()).toBe(0);
  });

  it("take espera a vez e desiste se a espera passar de maxWaitMs", async () => {
    const l = new RateLimiter(4);
    for (let i = 0; i < 4; i++) expect(await l.take({ maxWaitMs: 0 })).toBe(true);
    expect(await l.take({ maxWaitMs: 0 })).toBe(false); // próxima ficha só em ~250 ms
    expect(await l.take({ maxWaitMs: 400 })).toBe(true);
  });

  it("pause segura o canal até o fim da espera pedida pelo provedor", () => {
    let t = 0;
    const l = new RateLimiter(8, () => t);
    l.pause(3000);
    expect(l.isPaused()).toBe(true);
    expect(l.waitMs()).toBe(3000);
    t = 3000;
    expect(l.isPaused()).toBe(false);
  });

  it("EMAIL_MAX_PER_SEC padrão 8; 0 desliga; WhatsApp sem limite por padrão; valor inválido recusa", () => {
    expect(rateLimitersFromEnv({}).email?.perSec).toBe(8);
    expect(rateLimitersFromEnv({}).whatsapp).toBeUndefined();
    expect(rateLimitersFromEnv({ EMAIL_MAX_PER_SEC: "0" }).email).toBeUndefined();
    expect(rateLimitersFromEnv({ EMAIL_MAX_PER_SEC: "4", WHATSAPP_MAX_PER_SEC: "2" }).whatsapp?.perSec).toBe(2);
    expect(() => rateLimitersFromEnv({ EMAIL_MAX_PER_SEC: "muito" })).toThrow(/EMAIL_MAX_PER_SEC/);
  });

  it("Retry-After em segundos ou data; senão ratelimit-reset; senão null", () => {
    expect(retryAfterMs(new Headers({ "retry-after": "2" }))).toBe(2000);
    expect(retryAfterMs(new Headers({ "retry-after": new Date(10_000).toUTCString() }), 4000)).toBe(6000);
    expect(retryAfterMs(new Headers({ "ratelimit-reset": "1" }))).toBe(1000);
    expect(retryAfterMs(new Headers())).toBeNull();
  });

  it("RateLimitError não é permanente (a mensagem continua na fila)", () => {
    const e = new RateLimitError("HTTP 429", 1000);
    expect(e.permanent).toBe(false);
    expect(e.retryAfterMs).toBe(1000);
  });

  it("faixas de prioridade: convite primeiro, inscrição recebida por último, todo tipo em uma faixa", () => {
    expect(PRIORITY_TIERS[0]).toContain("invite");
    expect(PRIORITY_TIERS.at(-1)).toContain("registered");
    const all = PRIORITY_TIERS.flat();
    for (const t of OUTBOX_TYPES) expect(all, `falta ${t}`).toContain(t);
    expect(new Set(all).size).toBe(all.length);
  });
});
