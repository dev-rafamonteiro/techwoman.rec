import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi, TEST_PASSWORD } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

const api = await loadApi();
const body = (over: Record<string, unknown> = {}) => ({
  name: "Maria Silva", email: "Maria@Exemplo.test", phone: "(81) 99999-1234", area: "dados", preferredPeriod: "morning",
  consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok", ...over,
});

describe.skipIf(!api)("público e autenticação: E01-E05, E10-E13 (RN01, RN02)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "pub", { mentors: 1, mentees: 0 });
  });
  afterAll(async () => b?.close());

  it("E01: evento público sem dados sensíveis", async () => {
    const r = await b.anon.get("/api/public/event");
    expect(r.status).toBe(200);
    expect(r.body.registrationOpen ?? r.body.event?.registrationOpen).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|tokenHash/);
  });

  it("E02: sem Turnstile válido -> 403 TURNSTILE_FAILED", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ turnstileToken: "invalido" }));
    expect([r.status, r.body.code]).toEqual([403, "TURNSTILE_FAILED"]);
  });

  it("E02: cria (201), grava só o hash do token, e-mail normalizado, consentimento com versão (RN01, LGPD)", async () => {
    const r = await b.anon.post("/api/public/mentees", body());
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    expect(r.body.personalPath).toContain(r.body.token);
    const doc = (await getCollections(b.t.db).mentees.findOne({}))!;
    expect(doc.emailNorm).toBe("maria@exemplo.test");
    expect(doc.phone).toMatch(/^\+55/);
    expect(doc.status).toBe("waiting");
    expect(doc.consent?.version).toBe("2026-10-v1");
    expect(JSON.stringify(doc)).not.toContain(r.body.token);
    expect(await b.t.db.collection("outbox").countDocuments({ type: "registered" })).toBeGreaterThan(0);
  });

  it("E02: mesmo e-mail (outra caixa/espaços) -> 200 ALREADY_REGISTERED, sem segunda inscrição, link reenviado (RN01)", async () => {
    const r = await b.anon.post("/api/public/mentees", body({ email: "  MARIA@exemplo.test " }));
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("ALREADY_REGISTERED");
    expect(r.body.token).toBeUndefined();
    expect(await getCollections(b.t.db).mentees.countDocuments({})).toBe(1);
  });

  it("E02: campos extras e consentimento falso -> 422", async () => {
    expect((await b.anon.post("/api/public/mentees", body({ email: "x@y.test", admin: true }))).status).toBe(422);
    expect((await b.anon.post("/api/public/mentees", body({ email: "z@y.test", consent: { accepted: false, version: "1" } }))).status).toBe(422);
  });

  it("RN01: inscrição cancelled reativa como waiting sem prioridade e com novo queuedAt", async () => {
    const { mentees } = getCollections(b.t.db);
    const before = (await mentees.findOne({}))!;
    await mentees.updateOne({ _id: before._id }, { $set: { status: "cancelled", priority: true } });
    b.clock.now = new Date(b.clock.now.getTime() + 60_000);
    const r = await b.anon.post("/api/public/mentees", body());
    expect(r.status).toBe(201);
    const after = (await mentees.findOne({ _id: before._id }))!;
    expect(after.status).toBe("waiting");
    expect(after.priority).toBe(false);
    expect(after.queuedAt.getTime()).toBeGreaterThan(before.queuedAt.getTime());
    expect(await mentees.countDocuments({})).toBe(1);
  });

  it("RN02: inscrições fechadas ou após o início do último horário -> 403 REGISTRATION_CLOSED", async () => {
    b.clock.now = new Date("2026-11-14T20:30:00Z"); // 17:30 Recife, último slot começa 17:15
    let r = await b.anon.post("/api/public/mentees", body({ email: "tarde@y.test" }));
    expect([r.status, r.body.code]).toEqual([403, "REGISTRATION_CLOSED"]);
    b.clock.now = new Date("2026-11-14T11:00:00Z");
    await getCollections(b.t.db).events.updateOne({}, { $set: { registrationOpen: false } });
    r = await b.anon.post("/api/public/mentees", body({ email: "fechada@y.test" }));
    expect([r.status, r.body.code]).toEqual([403, "REGISTRATION_CLOSED"]);
    await getCollections(b.t.db).events.updateOne({}, { $set: { registrationOpen: true } });
  });

  it("E05: sempre 202, exista ou não o e-mail (sem enumeração)", async () => {
    const a = await b.anon.post("/api/public/resend-link", { email: "maria@exemplo.test", turnstileToken: "test-ok" });
    const c = await b.anon.post("/api/public/resend-link", { email: "ninguem@exemplo.test", turnstileToken: "test-ok" });
    expect([a.status, c.status]).toEqual([202, 202]);
    expect(a.body).toEqual(c.body);
  });

  it("E03: token inválido -> 401; sem token -> 401", async () => {
    expect((await Client.asMentee(b.app, "token-que-nao-existe").get("/api/public/me")).status).toBe(401);
    expect((await b.anon.get("/api/public/me")).status).toBe(401);
  });

  describe("E10-E13 autenticação", () => {
    it("E10 login ok devolve usuário e cookie sid httpOnly; senha errada -> 401 INVALID_CREDENTIALS", async () => {
      const c = new Client(b.app);
      const ok = await c.login("mentora1@techwoman.test");
      expect(ok.status).toBe(200);
      expect(ok.body.user.roles).toEqual(["mentor"]);
      expect(String(ok.headers["set-cookie"])).toMatch(/HttpOnly/i);
      expect(JSON.stringify(ok.body)).not.toContain("passwordHash");
      const bad = await new Client(b.app).login("mentora1@techwoman.test", "errada-errada");
      expect([bad.status, bad.body.code]).toEqual([401, "INVALID_CREDENTIALS"]);
    });

    it("E12 /auth/me e E11 logout revoga a sessão na hora", async () => {
      const c = new Client(b.app);
      await c.login("mentora1@techwoman.test");
      expect((await c.get("/api/auth/me")).status).toBe(200);
      expect((await c.post("/api/auth/logout")).status).toBe(200);
      expect((await c.get("/api/auth/me")).status).toBe(401);
    });

    it("E13 troca de senha exige a atual, revoga as outras sessões", async () => {
      const c1 = new Client(b.app);
      const c2 = new Client(b.app);
      await c1.login("mentora1@techwoman.test");
      await c2.login("mentora1@techwoman.test");
      const wrong = await c1.post("/api/auth/change-password", { currentPassword: "x".repeat(12), newPassword: "Nova-Senha-Forte-1" });
      expect(wrong.status).toBeGreaterThanOrEqual(400);
      const ok = await c1.post("/api/auth/change-password", { currentPassword: TEST_PASSWORD, newPassword: "Nova-Senha-Forte-1" });
      expect(ok.status).toBe(200);
      expect((await c2.get("/api/auth/me")).status).toBe(401);
      expect((await c1.get("/api/auth/me")).status).toBe(200);
      const back = await c1.post("/api/auth/change-password", { currentPassword: "Nova-Senha-Forte-1", newPassword: TEST_PASSWORD });
      expect(back.status).toBe(200);
    });

    it("E10: 5 falhas bloqueiam a conta por 5 min -> 423 ACCOUNT_LOCKED, inclusive com a senha certa; libera depois", async () => {
      const email = "admin@techwoman.test";
      for (let i = 0; i < 5; i++) await new Client(b.app).login(email, "senha-errada-123");
      const locked = await new Client(b.app).login(email);
      expect([locked.status, locked.body.code]).toEqual([423, "ACCOUNT_LOCKED"]);
      b.clock.now = new Date(b.clock.now.getTime() + 5 * 60_000 + 1000);
      expect((await new Client(b.app).login(email)).status).toBe(200);
    });

    it("RN12: desativar mentora revoga as sessões dela", async () => {
      const c = new Client(b.app);
      await c.login("mentora1@techwoman.test");
      const id = String((await getCollections(b.t.db).users.findOne({ email: "mentora1@techwoman.test" }))!._id);
      const r = await b.admin.patch(`/api/admin/mentors/${id}`, { status: "disabled" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect((await c.get("/api/auth/me")).status).toBe(401);
      expect((await new Client(b.app).login("mentora1@techwoman.test")).status).toBe(403);
    });
  });
});
