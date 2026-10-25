import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";
import { getOrCreateShortLink, shortLinkExpireAt } from "../../src/api/lib/short-links.js";

/**
 * PLAN, Notificações > Links curtos (E48): 302 para P6 ou E06 com token derivado na hora, mesma resposta para
 * inexistente/inválido/revogado, no-store e no-referrer, get-or-create idempotente, E36 apaga, rate limit por IP.
 * Rate limit ligado neste boot (RATE_LIMIT=true).
 */
const api = await loadApi();
const BASE = "http://localhost:5173";
const body = (over: Record<string, unknown> = {}) => ({
  name: "Maria Silva", email: "maria.curto@exemplo.test", phone: "(81) 99999-1234", area: "dados", preferredPeriod: "morning",
  consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok", ...over,
});
const CODE = /\/l\/([0-9A-Za-z]{7})/g;
const codesIn = (s: string) => [...new Set([...s.matchAll(CODE)].map((m) => m[1]!))];

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("E48 link curto /l/<código>", () => {
  let b: Booted;
  let token: string;
  let personalPath: string;
  let code: string;
  beforeAll(async () => {
    b = await bootApi(api!, "shortlink", { mentors: 1, mentees: 0, env: { RATE_LIMIT: "true", PUBLIC_BASE_URL: BASE } });
    const r = await b.anon.post("/api/public/mentees", body());
    expect(r.status).toBe(201);
    ({ token, personalPath } = r.body);
    code = r.body.shortPath.slice(3);
  });
  afterAll(async () => b?.close());

  const c = () => getCollections(b.t.db);
  const go = (cl: Client, path: string) => cl.get(`/api${path}`);
  const expectInvalid = (r: { status: number; body: unknown; headers: Record<string, any> }) => {
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/mentoria/minha");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.body ?? "").toBe("");
  };

  it("personal: 302 para /mentoria/minha?t=<token>, sem corpo, no-store e no-referrer", async () => {
    const r = await go(b.anon, `/l/${code}`);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(personalPath);
    expect(r.headers.location).toBe(`/mentoria/minha?t=${token}`);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.body ?? "").toBe("");
  });

  it("inexistente, formato inválido e longo demais: resposta idêntica (302 para /mentoria/minha), nunca 422", async () => {
    for (const bad of ["Zz9Zz9Z", "abc", "Pers-01", "x".repeat(65), encodeURIComponent("a b")]) expectInvalid(await go(b.anon, `/l/${bad}`));
  });

  it("e-mail do worker leva o link curto; reenviar reaproveita o mesmo código (1 doc por participante + tipo + versão)", async () => {
    expect((await b.anon.post("/api/public/mentees", body())).status).toBe(200); // ALREADY_REGISTERED: reenvia
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    const regs = n.sent.filter((m: any) => m.type === "registered" && m.channel === "email");
    expect(regs.length).toBe(2);
    for (const m of regs) {
      expect(m.text).toContain(`${BASE}/l/${code}`);
      expect(m.html).toContain(`${BASE}/l/${code}`);
      expect(m.text).not.toContain("?t=");
      expect(m.html).not.toContain("?t=");
    }
    const mentee = (await c().mentees.findOne({ emailNorm: "maria.curto@exemplo.test" }))!;
    expect(await c().shortLinks.countDocuments({ menteeId: mentee._id, kind: "personal" })).toBe(1);
  });

  it("calendar: e-mail de confirmação traz link_agenda curto, 302 para E06 e o .ics abre", async () => {
    const mentee = (await c().mentees.findOne({ emailNorm: "maria.curto@exemplo.test" }))!;
    const inv = await b.mentor[0]!.post("/api/mentor/appointments", { menteeId: String(mentee._id), slotId: b.w.slotIds[3]!, tableId: String(b.w.tables[0]!._id) });
    expect(inv.status).toBe(201);
    expect((await Client.asMentee(b.app, token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    const conf = n.sent.find((m: any) => m.type === "confirmed" && m.channel === "email");
    expect(conf.html).not.toContain("?t=");
    const cal = (await c().shortLinks.findOne({ menteeId: mentee._id, kind: "calendar" }))!;
    expect(codesIn(conf.html).sort()).toEqual([code, cal._id].sort());
    expect(JSON.stringify(cal)).not.toContain(token);
    const r = await go(b.anon, `/l/${cal._id}`);
    expect([r.status, r.headers.location]).toEqual([302, `/api/public/calendar.ics?t=${token}`]);
    const ics = await b.anon.get(r.headers.location);
    expect(ics.status).toBe(200);
    expect(ics.headers["content-type"]).toMatch(/^text\/calendar/);
  });

  it("get-or-create em corrida (Promise.all) gera um só código", async () => {
    const mentee = (await c().mentees.findOne({ emailNorm: "maria.curto@exemplo.test" }))!;
    const v = { _id: mentee._id, tokenVersion: mentee.tokenVersion + 50 };
    const codes = await Promise.all(Array.from({ length: 8 }, () => getOrCreateShortLink(c(), v, "personal", new Date(Date.now() + 86_400_000))));
    expect(new Set(codes).size).toBe(1);
    expect(await c().shortLinks.countDocuments({ menteeId: mentee._id, tokenVersion: v.tokenVersion })).toBe(1);
    await c().shortLinks.deleteMany({ tokenVersion: v.tokenVersion });
  });

  it("tokenVersion mudou: link antigo revogado, resposta idêntica à de código inexistente", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ email: "outra.curto@exemplo.test" }));
    const other = r.body.shortPath as string;
    expect((await go(b.anon, other)).headers.location).toBe(r.body.personalPath);
    await c().mentees.updateOne({ emailNorm: "outra.curto@exemplo.test" }, { $inc: { tokenVersion: 1 } });
    expectInvalid(await go(b.anon, other));
  });

  it("E36 anonymize apaga os short_links da participante e o link deixa de valer", async () => {
    const mentee = (await c().mentees.findOne({ emailNorm: "maria.curto@exemplo.test" }))!;
    expect(await c().shortLinks.countDocuments({ menteeId: mentee._id })).toBeGreaterThan(0);
    const r = await b.admin.patch(`/api/admin/mentees/${mentee._id}`, { action: "anonymize" });
    expect(r.status).toBe(200);
    expect(await c().shortLinks.countDocuments({ menteeId: mentee._id })).toBe(0);
    expectInvalid(await go(b.anon, `/l/${code}`));
  });

  it("validade: expireAt = fim do evento + 7 dias; vencido dá a resposta de inválido; E41 mudando a data recalcula", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ email: "validade.curto@exemplo.test" }));
    const path = r.body.shortPath as string;
    const event = (await c().events.findOne({}))!;
    const doc = (await c().shortLinks.findOne({ _id: path.slice(3) }))!;
    expect(doc.expireAt.toISOString()).toBe(shortLinkExpireAt(event).toISOString());
    // E41 muda a data do evento: a validade acompanha
    const { event: cfg } = (await b.superAdmin.get("/api/admin/event")).body;
    const { id: _id, slots: _slots, ...put } = cfg;
    const next = new Date(new Date(`${cfg.date}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const u = await b.superAdmin.put("/api/admin/event", { ...put, date: next });
    expect(u.status).toBe(200);
    const after = (await c().shortLinks.findOne({ _id: path.slice(3) }))!;
    expect(after.expireAt.toISOString()).toBe(shortLinkExpireAt({ ...event, date: next }).toISOString());
    // vencido (o TTL do MongoDB ainda não passou): mesma resposta de inexistente
    await c().shortLinks.updateOne({ _id: path.slice(3) }, { $set: { expireAt: new Date(b.clock.now.getTime() - 1000) } });
    expectInvalid(await go(b.anon, path));
  });

  it("rate limit por IP: 600 por minuto, depois 429", async () => {
    const cl = new Client(b.app);
    for (let i = 0; i < 600; i++) expect((await go(cl, "/l/bad")).status, `req ${i + 1}`).toBe(302);
    const r = await go(cl, "/l/bad");
    expect([r.status, r.body.code]).toEqual([429, "RATE_LIMITED"]);
    // outro IP não é afetado
    expect((await go(new Client(b.app), "/l/bad")).status).toBe(302);
  });
});
