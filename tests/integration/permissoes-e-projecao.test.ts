import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

const api = await loadApi();

describe.skipIf(!api)("permissões, escopo por dono e projeção sem contato (matriz de permissões; E22, E35)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "perm", { mentors: 2, mentees: 5 });
  });
  afterAll(async () => b?.close());

  it("sem sessão: 401 UNAUTHENTICATED em rota de mentora e de admin", async () => {
    for (const url of ["/api/mentor/queue", "/api/mentor/appointments", "/api/admin/dashboard", "/api/auth/me"]) {
      const r = await b.anon.get(url);
      expect(r.status, url).toBe(401);
      expect(r.body.code).toBe("UNAUTHENTICATED");
    }
  });

  it("requireRole: mentora não acessa /admin/*; admin não acessa /mentor/*; admin não acessa rotas de super admin", async () => {
    for (const url of ["/api/admin/dashboard", "/api/admin/mentees", "/api/admin/schedule", "/api/admin/audit"]) {
      const r = await b.mentor[0]!.get(url);
      expect([r.status, r.body.code], url).toEqual([403, "FORBIDDEN"]);
    }
    expect((await b.admin.get("/api/mentor/queue")).status).toBe(403);
    for (const url of ["/api/admin/event", "/api/admin/tables", "/api/admin/users"]) {
      const r = await b.admin.get(url);
      expect([r.status, r.body.code], url).toEqual([403, "FORBIDDEN"]);
      expect((await b.superAdmin.get(url)).status, `super ${url}`).toBe(200);
    }
  });

  it("CSRF: escrita sem X-Requested-With é recusada (403 CSRF)", async () => {
    const r = await b.app.inject({ method: "PUT", url: "/api/mentor/availability", headers: { cookie: b.mentor[0]!.cookie! }, payload: { slotIds: [] } });
    expect(r.statusCode).toBe(403);
    expect(JSON.parse(r.body).code).toBe("CSRF");
  });

  it("corpo com campo extra -> 422 VALIDATION_ERROR (strict)", async () => {
    const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: [], extra: 1 });
    expect([r.status, r.body.code]).toEqual([422, "VALIDATION_ERROR"]);
  });

  describe("E22: fila da mentora SEM e-mail, telefone e consentimento (projeção por papel)", () => {
    it("nenhum campo nem valor de contato aparece na resposta", async () => {
      const r = await b.mentor[0]!.get("/api/mentor/queue");
      expect(r.status).toBe(200);
      expect(r.body.items).toHaveLength(5);
      const text = JSON.stringify(r.body);
      for (const m of b.w.mentees) {
        expect(text).not.toContain(m.doc.email);
        expect(text).not.toContain(m.doc.phone!);
      }
      for (const key of ["email", "emailNorm", "phone", "consent", "tokenHash", "token"]) expect(text, key).not.toMatch(new RegExp(`"${key}"`));
    });

    it("admin (E35) vê contato", async () => {
      const r = await b.admin.get("/api/admin/mentees");
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.body);
      expect(text).toContain(b.w.mentees[0]!.doc.email);
      expect(text).not.toContain("tokenHash");
    });

    it("RN03: prioridade primeiro, depois queuedAt mais antigo", async () => {
      const { mentees } = getCollections(b.t.db);
      await mentees.updateOne({ _id: b.w.mentees[3]!.doc._id }, { $set: { priority: true, priorityReason: "declined_schedule" } });
      const r = await b.mentor[0]!.get("/api/mentor/queue");
      const names = r.body.items.map((i: any) => i.name);
      expect(names[0]).toBe("Participante 4");
      expect(names.slice(1)).toEqual(["Participante 1", "Participante 2", "Participante 3", "Participante 5"]);
    });

    it("só lista waiting: quem foi convidada sai da fila", async () => {
      const inv = await b.invite(0, 0, 3, 0);
      expect(inv.status, JSON.stringify(inv.body)).toBe(201);
      const r = await b.mentor[1]!.get("/api/mentor/queue");
      expect(r.body.items.map((i: any) => i.name)).not.toContain("Participante 1");
      // resposta de E24 também sem contato
      expect(JSON.stringify(inv.body)).not.toContain(b.w.mentees[0]!.doc.email);
    });
  });

  describe("escopo por dono (mentorId = sessão no próprio filtro)", () => {
    it("E25 só devolve as mentorias da própria mentora", async () => {
      const mine = await b.mentor[0]!.get("/api/mentor/appointments");
      const other = await b.mentor[1]!.get("/api/mentor/appointments");
      const booked = (r: any) => r.body.slots.filter((s: any) => s.appointment).length;
      expect(booked(mine)).toBe(1);
      expect(booked(other)).toBe(0);
    });

    it("E26: mentora B não age na mentoria da mentora A (404/403) e nada muda", async () => {
      const { appointments } = getCollections(b.t.db);
      const a = (await appointments.findOne({}))!;
      const r = await b.mentor[1]!.patch(`/api/mentor/appointments/${a._id}`, { action: "cancel" });
      expect([403, 404]).toContain(r.status);
      expect((await appointments.findOne({ _id: a._id }))!.status).toBe("invited");
    });

    it("E24: mentorId não é aceito no corpo (sempre a da sessão)", async () => {
      const r = await b.mentor[1]!.post("/api/mentor/appointments", { menteeId: String(b.w.mentees[1]!.doc._id), slotId: "s05", tableId: String(b.w.tables[1]!._id), mentorId: String(b.w.mentors[0]!._id) });
      expect(r.status).toBe(422);
    });
  });

  it("RN11: remover do E21 horário com mentoria ativa -> 409 SLOT_IN_USE", async () => {
    const all = b.w.slotIds;
    const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: all.filter((s) => s !== b.w.slotIds[3]) });
    expect([r.status, r.body.code]).toEqual([409, "SLOT_IN_USE"]);
  });

  it("RN04: horário fora da disponibilidade -> 409 SLOT_UNAVAILABLE com details.reason", async () => {
    await b.mentor[1]!.put("/api/mentor/availability", { slotIds: ["s01"] });
    const r = await b.invite(1, 1, 6, 2);
    expect([r.status, r.body.code, r.body.details?.reason]).toEqual([409, "SLOT_UNAVAILABLE", "not_available"]);
  });

  it("RN04: antecedência mínima -> SLOT_UNAVAILABLE lead_time", async () => {
    b.clock.now = new Date(b.w.mentors.length ? "2026-11-14T12:55:00Z" : "2026-11-14T12:55:00Z"); // 09:55 Recife; slot s02 começa 09:45
    const r = await b.invite(0, 2, 1, 4);
    expect([r.status, r.body.details?.reason]).toEqual([409, "lead_time"]);
  });

  it("RN17: toda escrita gera auditoria", async () => {
    expect(await b.t.db.collection("audit_logs").countDocuments({})).toBeGreaterThan(0);
  });

  it("papel duplo: Client.asMentee não acessa rotas de staff", async () => {
    const c = Client.asMentee(b.app, b.w.mentees[1]!.token);
    expect((await c.get("/api/mentor/queue")).status).toBe(401);
    expect((await c.get("/api/public/me")).status).toBe(200);
  });
});
