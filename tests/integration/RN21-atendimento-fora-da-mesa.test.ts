import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { randomBytes } from "node:crypto";
import { menteeDoc, sha256 } from "../helpers/seed.js";
import { MENTEES_TEXT_INDEX, ensureSearchIndex, waitForCount } from "../helpers/search.js";
import { getCollections } from "../../src/db/collections.js";
import type { MenteeDoc } from "../../src/db/types.js";

/**
 * RN21 · Atendimento fora da mesa (E50–E53) sobre o mongo-local com Atlas Search:
 * busca tolerante a erro sem contato e sem canceladas, registro com efeito na fila, cadastro rápido com aceite e
 * e-mail, duplicidades, remoção pelo admin devolvendo à fila, avaliação (E09) e relatórios (E30, E31, E35, E37, E49).
 */
const api = await loadApi();

describe.skipIf(!api)("RN21 · atendimento fora da mesa (E50–E53)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const seeded = new Map<string, { token: string; doc: MenteeDoc }>();
  const id = (name: string) => String(seeded.get(name)!.doc._id);
  const fresh = (name: string) => c.mentees.findOne({ _id: seeded.get(name)!.doc._id });
  const search = (q: string, who = 0) => b.mentor[who]!.get(`/api/mentor/mentees/search?q=${encodeURIComponent(q)}`);
  const walkIn = (body: unknown, who = 0) => b.mentor[who]!.post("/api/mentor/walk-ins", body);
  const del = (walkInId: string) => b.admin.req("DELETE", `/api/admin/walk-ins/${walkInId}`);

  beforeAll(async () => {
    b = await bootApi(api!, "rn21", { mentors: 2, mentees: 0 });
    c = getCollections(b.t.db);
    const base = Date.now() - 3600_000;
    const seeds: [string, Partial<MenteeDoc>][] = [
      ["Joana Lima", {}],
      ["Joana Lins", { status: "cancelled" }],
      ["Carla Moura", {}],
      ["Renata Prado", {}],
      ["Beatriz Campos", { priority: true, priorityReason: "manual" }],
      ["Sofia Andrade", {}],
      ["Helena Dias", { status: "no_show" }],
    ];
    seeds.forEach(([name, over], i) => {
      const m = menteeDoc(i + 1, { name, queuedAt: new Date(base + i * 1000), ...over } as Partial<MenteeDoc>);
      seeded.set(name, m);
    });
    await c.mentees.insertMany([...seeded.values()].map((m) => m.doc));
    // Renata: convidada e confirmada pelo fluxo normal (mentoria marcada na mesa)
    const inv = await b.mentor[1]!.post("/api/mentor/appointments", { menteeId: id("Renata Prado"), slotId: b.w.slotIds[5]!, tableId: String(b.w.tables[0]!._id) });
    expect(inv.status).toBe(201);
    expect((await Client.asMentee(b.app, seeded.get("Renata Prado")!.token).post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    const col = b.t.db.collection("mentees");
    await ensureSearchIndex(col, MENTEES_TEXT_INDEX);
    await waitForCount(() => col.aggregate([{ $search: { index: "mentees_text", text: { query: "Helena Dias", path: "name" } } }]).toArray(), 1);
    await waitForCount(() => col.aggregate([{ $search: { index: "mentees_text", text: { query: "Joana", path: "name" } } }]).toArray(), 2);
  }, 300_000);

  afterAll(async () => {
    if (b) {
      const col = b.t.db.collection("mentees");
      for (const ix of await col.listSearchIndexes().toArray()) await col.dropSearchIndex(ix.name).catch(() => {});
      await b.close();
    }
  });

  describe("E50 · busca", () => {
    it('erro de digitação "Joanna Lmia" encontra "Joana Lima" (na fila); a cancelada "Joana Lins" nunca aparece', async () => {
      const r = await search("Joanna Lmia");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const names = (r.body.items as any[]).map((i) => i.mentee.name);
      expect(names).toContain("Joana Lima");
      expect(names).not.toContain("Joana Lins");
      expect(r.body.items.find((i: any) => i.mentee.name === "Joana Lima")).toMatchObject({ situation: "waiting", startAt: null });
      for (const q of ["Joana", "Joana Lins", "Lins"]) {
        const x = await search(q);
        expect((x.body.items as any[]).map((i) => i.mentee.name), q).not.toContain("Joana Lins");
      }
    });

    it("sem e-mail nem telefone na resposta (nem os valores)", async () => {
      for (const q of ["Joana", "Renata Prado", "Helena", "Carla"]) {
        const r = await search(q);
        expect(r.status).toBe(200);
        const text = JSON.stringify(r.body);
        for (const key of ["email", "emailNorm", "phone", "consent", "tokenHash"]) expect(text, `${q} ${key}`).not.toMatch(new RegExp(`"${key}"`));
        for (const m of seeded.values()) {
          expect(text).not.toContain(m.doc.email);
          expect(text).not.toContain(m.doc.phone!);
        }
      }
    });

    it("situação: mentoria agendada traz o horário; não compareceu aparece como no_show", async () => {
      const r = await search("Renata Prado");
      const renata = (r.body.items as any[]).find((i) => i.mentee.name === "Renata Prado");
      const appt = (await c.appointments.findOne({ menteeId: seeded.get("Renata Prado")!.doc._id }))!;
      expect(renata).toMatchObject({ situation: "scheduled", startAt: appt.startAt.toISOString() });
      const h = (await search("Helena Dias")).body.items.find((i: any) => i.mentee.name === "Helena Dias");
      expect(h.situation).toBe("no_show");
    });

    it("mínimo de 2 caracteres (422); só mentora (admin 403)", async () => {
      expect((await search("J")).status).toBe(422);
      expect((await b.admin.get("/api/mentor/mentees/search?q=Joana")).status).toBe(403);
    });
  });

  describe("E51 · registrar", () => {
    let joanaWalkIn: string;

    it("participante na fila -> concluída (sai da fila), com walk_in, auditoria e sem e-mail", async () => {
      const outboxBefore = await c.outbox.countDocuments({ menteeId: seeded.get("Joana Lima")!.doc._id });
      const r = await walkIn({ menteeId: id("Joana Lima"), note: "  Conversamos sobre currículo  " });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "existing", linkedExisting: false, name: "Joana Lima", previousStatus: "waiting", status: "done" });
      expect(r.body.walkIn).toMatchObject({ note: "Conversamos sobre currículo", mentee: { name: "Joana Lima", status: "done" } });
      expect(JSON.stringify(r.body)).not.toMatch(/"email"|"phone"/);
      joanaWalkIn = r.body.walkIn.id;
      const m = (await fresh("Joana Lima"))!;
      expect([m.status, m.currentAppointmentId]).toEqual(["done", null]);
      const w = (await c.walkIns.findOne({ _id: new ObjectId(joanaWalkIn) }))!;
      expect(w).toMatchObject({ previousMenteeStatus: "waiting", mentorId: b.w.mentors[0]!._id, deletedAt: null, deletedBy: null });
      expect(await c.appointments.countDocuments({ menteeId: m._id })).toBe(0);
      expect(await c.auditLogs.countDocuments({ action: "walk_in.create", entityId: joanaWalkIn })).toBe(1);
      expect(await c.outbox.countDocuments({ menteeId: m._id })).toBe(outboxBefore);
      // saiu da fila (E22)
      const q = await b.mentor[1]!.get("/api/mentor/queue");
      expect((q.body.items as any[]).map((i) => i.name)).not.toContain("Joana Lima");
      // E50 mostra "atendida por você" para quem registrou e "já atendida" para a outra
      expect((await search("Joana Lima")).body.items.find((i: any) => i.mentee.name === "Joana Lima").situation).toBe("walked_in_by_me");
      expect((await search("Joana Lima", 1)).body.items.find((i: any) => i.mentee.name === "Joana Lima").situation).toBe("done");
    });

    it("mesma mentora e participante de novo -> 409 CONFLICT com mensagem amigável; outra mentora pode registrar", async () => {
      const r = await walkIn({ menteeId: id("Joana Lima") });
      expect([r.status, r.body.code]).toEqual([409, "CONFLICT"]);
      expect(r.body.message).toMatch(/já registrou/);
      const other = await walkIn({ menteeId: id("Joana Lima") }, 1);
      expect(other.status).toBe(201);
      expect(other.body).toMatchObject({ previousStatus: "done", status: "done" });
    });

    it("mentoria confirmada na mesa: status e mentoria continuam", async () => {
      const r = await walkIn({ menteeId: id("Renata Prado") });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ previousStatus: "confirmed", status: "confirmed" });
      const m = (await fresh("Renata Prado"))!;
      expect(m.status).toBe("confirmed");
      expect((await c.appointments.findOne({ _id: m.currentAppointmentId! }))!.status).toBe("confirmed");
    });

    it("cancelada não pode ser escolhida (409 INVALID_STATE); participante inexistente 404", async () => {
      const r = await walkIn({ menteeId: id("Joana Lins") });
      expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
      expect((await walkIn({ menteeId: String(new ObjectId()) })).status).toBe(404);
      expect(await c.walkIns.countDocuments({ menteeId: seeded.get("Joana Lins")!.doc._id })).toBe(0);
    });

    it("cadastro rápido com inscrições fechadas (RN02 não vale): cria concluída, aceite colhido pela mentora e e-mail com o link", async () => {
      await c.events.updateOne({}, { $set: { registrationOpen: false } });
      try {
        const r = await walkIn({ newMentee: { name: "Larissa Novaes", email: " Larissa.Novaes@Exemplo.test ", phone: "(81) 99876-5432", area: "dados" }, consentAccepted: true, note: "Primeira conversa" });
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        expect(r.body).toMatchObject({ outcome: "created", linkedExisting: false, name: "Larissa Novaes", previousStatus: null, status: "done" });
        const m = (await c.mentees.findOne({ emailNorm: "larissa.novaes@exemplo.test" }))!;
        const event = (await c.events.findOne({}))!;
        expect(m).toMatchObject({ status: "done", preferredPeriod: "any", phone: "+5581998765432", area: "dados", priority: false });
        expect(m.consent).toMatchObject({ version: event.consentVersion, collectedBy: b.w.mentors[0]!._id });
        const mail = await c.outbox.find({ menteeId: m._id }).toArray();
        expect(mail.map((o) => [o.type, o.channel, o.to])).toEqual([["registered", "email", "larissa.novaes@exemplo.test"]]);
        expect(await c.auditLogs.countDocuments({ action: "mentee.register_by_staff", entityId: String(m._id) })).toBe(1);
        expect(await c.walkIns.countDocuments({ menteeId: m._id, previousMenteeStatus: null })).toBe(1);
      } finally {
        await c.events.updateOne({}, { $set: { registrationOpen: true } });
      }
    });

    it("cadastro rápido com e-mail já inscrito (RN01): liga à inscrição existente, sem criar outra nem mandar e-mail", async () => {
      const carla = seeded.get("Carla Moura")!.doc;
      const before = await c.mentees.countDocuments({});
      const r = await walkIn({ newMentee: { name: "Carla M.", email: carla.email.toUpperCase(), area: "dados" }, consentAccepted: true });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "linked", linkedExisting: true, name: "Carla Moura", previousStatus: "waiting", status: "done" });
      expect(await c.mentees.countDocuments({})).toBe(before);
      expect(await c.outbox.countDocuments({ menteeId: carla._id })).toBe(0);
      expect((await fresh("Carla Moura"))!.name).toBe("Carla Moura");
    });

    it("validação: sem aceite, área desconhecida ou celular inválido -> 422; admin não registra (403)", async () => {
      const nm = { name: "Teste Silva", email: "teste.silva@exemplo.test", area: "dados" };
      expect((await walkIn({ newMentee: nm })).status).toBe(422);
      expect((await walkIn({ newMentee: { ...nm, area: "astronomia" }, consentAccepted: true })).status).toBe(422);
      expect((await walkIn({ newMentee: { ...nm, phone: "(00) 1234-5678" }, consentAccepted: true })).status).toBe(422);
      expect((await b.admin.post("/api/mentor/walk-ins", { menteeId: id("Sofia Andrade") })).status).toBe(403);
      expect(await c.mentees.countDocuments({ emailNorm: nm.email })).toBe(0);
    });

    it("Idempotency-Key: repetir o mesmo pedido devolve a mesma resposta sem duplicar", async () => {
      const h = { "Idempotency-Key": "rn21-sofia-1" };
      const a = await b.mentor[1]!.post("/api/mentor/walk-ins", { menteeId: id("Sofia Andrade") }, h);
      const again = await b.mentor[1]!.post("/api/mentor/walk-ins", { menteeId: id("Sofia Andrade") }, h);
      expect([a.status, again.status]).toEqual([201, 201]);
      expect(again.headers["idempotent-replay"]).toBe("true");
      expect(again.body.walkIn.id).toBe(a.body.walkIn.id);
      expect(await c.walkIns.countDocuments({ menteeId: seeded.get("Sofia Andrade")!.doc._id })).toBe(1);
    });

    it("E52 · lista os atendimentos da própria mentora, do mais recente ao mais antigo, sem contato", async () => {
      const r = await b.mentor[0]!.get("/api/mentor/walk-ins");
      expect(r.status).toBe(200);
      const names = (r.body.items as any[]).map((i) => i.mentee.name);
      expect(names).toEqual(["Carla Moura", "Larissa Novaes", "Renata Prado", "Joana Lima"]);
      expect(JSON.stringify(r.body)).not.toMatch(/"email"|"phone"/);
      expect((await b.mentor[1]!.get("/api/mentor/walk-ins")).body.items.map((i: any) => i.mentee.name)).toEqual(["Sofia Andrade", "Joana Lima"]);
      expect(joanaWalkIn).toBeTruthy();
    });
  });

  describe("E53 · admin", () => {
    it("lista com mentora e e-mail da participante; filtra por mentora; mentora não acessa", async () => {
      const all = await b.admin.get("/api/admin/walk-ins");
      expect(all.status).toBe(200);
      expect(all.body.items).toHaveLength(6);
      const larissa = (all.body.items as any[]).find((i) => i.mentee.name === "Larissa Novaes");
      expect(larissa).toMatchObject({ mentor: { name: "Mentora 1" }, mentee: { email: "larissa.novaes@exemplo.test", status: "done" }, note: "Primeira conversa" });
      const only = await b.admin.get(`/api/admin/walk-ins?mentorId=${b.w.mentors[1]!._id}`);
      expect((only.body.items as any[]).map((i) => i.mentor.name)).toEqual(["Mentora 2", "Mentora 2"]);
      expect((await b.mentor[0]!.get("/api/admin/walk-ins")).status).toBe(403);
    });

    it("remover o atendimento devolve à fila quem saiu dela por ele, com o queuedAt e a prioridade de antes", async () => {
      const bea = seeded.get("Beatriz Campos")!.doc;
      const r = await walkIn({ menteeId: String(bea._id) });
      expect(r.body.status).toBe("done");
      const d = await del(r.body.walkIn.id);
      expect(d.status, JSON.stringify(d.body)).toBe(200);
      expect(d.body).toEqual({ ok: true, restoredToQueue: true });
      const m = (await c.mentees.findOne({ _id: bea._id }))!;
      expect([m.status, m.priority, m.priorityReason, m.queuedAt.getTime()]).toEqual(["waiting", true, "manual", bea.queuedAt.getTime()]);
      const w = (await c.walkIns.findOne({ _id: new ObjectId(r.body.walkIn.id) }))!;
      expect(w.deletedAt).toBeInstanceOf(Date);
      expect(String(w.deletedBy)).toBe(String((await c.users.findOne({ email: "admin@techwoman.test" }))!._id));
      expect(await c.auditLogs.countDocuments({ action: "walk_in.delete", entityId: r.body.walkIn.id })).toBe(1);
      expect((await del(r.body.walkIn.id)).status).toBe(404);
      // pode registrar de novo depois da remoção (o índice único só vale para os ativos)
      const again = await walkIn({ menteeId: String(bea._id) });
      expect(again.status).toBe(201);
    });

    it("não volta à fila se outra mentora também a atendeu", async () => {
      const joana = seeded.get("Joana Lima")!.doc;
      const mine = (await c.walkIns.findOne({ menteeId: joana._id, mentorId: b.w.mentors[0]!._id, deletedAt: null }))!;
      const d = await del(String(mine._id));
      expect(d.body).toEqual({ ok: true, restoredToQueue: false });
      expect((await c.mentees.findOne({ _id: joana._id }))!.status).toBe("done");
    });

    it("um no_show antigo na mesa não impede a volta à fila (ela se inscreveu de novo, RN01)", async () => {
      // faltou à mentoria da mesa (no_show) e voltou para a fila pela nova inscrição: a mentoria antiga continua lá
      const m = menteeDoc(50, { name: "Paula Reis", queuedAt: new Date(Date.now() - 600_000) } as Partial<MenteeDoc>).doc;
      await c.mentees.insertOne(m);
      const renataAppt = (await c.appointments.findOne({ menteeId: seeded.get("Renata Prado")!.doc._id }))!;
      const { slotLock: _s, menteeLock: _m, ...rest } = renataAppt;
      await c.appointments.insertOne({ ...rest, _id: new ObjectId(), menteeId: m._id, status: "no_show" });
      const r = await walkIn({ menteeId: String(m._id) });
      expect([r.status, r.body.status]).toEqual([201, "done"]);
      const d = await del(r.body.walkIn.id);
      expect(d.body).toEqual({ ok: true, restoredToQueue: true });
      const after = (await c.mentees.findOne({ _id: m._id }))!;
      expect([after.status, after.queuedAt.getTime()]).toEqual(["waiting", m.queuedAt.getTime()]);
    });

    it("cadastro rápido com e-mail de quem não compareceu (no_show): reativa como concluída e reenvia o link", async () => {
      const m = menteeDoc(51, { name: "Tânia Rocha", status: "no_show" } as Partial<MenteeDoc>).doc;
      await c.mentees.insertOne(m);
      const r = await walkIn({ newMentee: { name: "Tânia Rocha", email: m.email, area: "dados" }, consentAccepted: true });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "reactivated", linkedExisting: false, previousStatus: "no_show", status: "done" });
      const after = (await c.mentees.findOne({ _id: m._id }))!;
      expect([after.status, after.linkSendCount]).toEqual(["done", m.linkSendCount + 1]);
      expect((await c.outbox.find({ menteeId: m._id }).toArray()).map((o) => o.type)).toEqual(["registered"]);
      expect(await c.walkIns.countDocuments({ menteeId: m._id, previousMenteeStatus: "no_show", deletedAt: null })).toBe(1);
    });
  });

  describe("avaliação e relatórios", () => {
    it("E09 · concluída pelo atendimento fora da mesa pode avaliar; P6 (E03) mostra com quem foi; A10 traz a mentora", async () => {
      const larissa = (await c.mentees.findOne({ emailNorm: "larissa.novaes@exemplo.test" }))!;
      // o link chegou por e-mail; aqui o teste troca o hash gravado por um token conhecido
      const token = randomBytes(32).toString("base64url");
      await c.mentees.updateOne({ _id: larissa._id }, { $set: { tokenHash: sha256(token) } });
      const me = Client.asMentee(b.app, token);
      const state = await me.get("/api/public/me");
      expect(state.status).toBe(200);
      expect(state.body).toMatchObject({ mentee: { status: "done" }, appointment: null, walkIn: { mentorName: "Mentora 1" }, feedback: null });
      const r = await me.post("/api/public/me/feedback", { event: 5, talk: 4, mentoring: 5, comment: "Muito boa a conversa" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const fb = (await c.feedbacks.findOne({ _id: larissa._id }))!;
      expect(fb).toMatchObject({ appointmentId: null, mentorId: b.w.mentors[0]!._id });
      expect(fb.walkInId).toBeInstanceOf(ObjectId);
      const a10 = await b.admin.get("/api/admin/feedback");
      expect((a10.body.items as any[]).find((i) => i.menteeName === "Larissa Novaes").mentorName).toBe("Mentora 1");
    });

    it("A1 (E30) conta à parte; A2 (E31) por mentora; A4 (E35) linha do tempo; E37 com a coluna fora_da_mesa", async () => {
      const active = await c.walkIns.countDocuments({ deletedAt: null });
      const dash = await b.admin.get("/api/admin/dashboard");
      expect(dash.body.counts.walkIns).toBe(active);
      expect(dash.body.counts.done).toBe(0); // nenhuma mentoria concluída na mesa
      const mentors = await b.admin.get("/api/admin/mentors");
      const byName = new Map((mentors.body.items as any[]).map((m) => [m.name, m.walkInCount]));
      expect(byName.get("Mentora 1")).toBe(await c.walkIns.countDocuments({ deletedAt: null, mentorId: b.w.mentors[0]!._id }));
      expect(byName.get("Mentora 2")).toBe(2);
      const detail = await b.admin.get(`/api/admin/mentees/${id("Joana Lima")}`);
      const labels = (detail.body.timeline as any[]).filter((t) => t.kind.startsWith("walk_in")).map((t) => t.label);
      expect(labels).toEqual(expect.arrayContaining(["Atendimento fora da mesa com Mentora 1: “Conversamos sobre currículo”", "Atendimento fora da mesa com Mentora 2", "Atendimento fora da mesa com Mentora 1 removido"]));
      const csv = await b.admin.get("/api/admin/mentees/export.csv");
      const lines = String(csv.body).replace(/^﻿/, "").trim().split("\r\n");
      expect(lines[0]!.split(",").at(-1)).toBe("fora_da_mesa");
      expect(lines.find((l) => l.startsWith("Joana Lima,"))!.split(",").at(-1)).toBe("Mentora 2");
      expect(lines.find((l) => l.startsWith("Renata Prado,"))!.split(",").at(-1)).toBe("Mentora 1");
    });

    it("anonimizar (E36) apaga a nota do atendimento e mantém o registro para os contadores", async () => {
      const larissa = (await c.mentees.findOne({ emailNorm: "larissa.novaes@exemplo.test" }))!;
      const r = await b.admin.patch(`/api/admin/mentees/${larissa._id}`, { action: "anonymize" });
      expect(r.status).toBe(200);
      const ws = await c.walkIns.find({ menteeId: larissa._id }).toArray();
      expect(ws).toHaveLength(1);
      expect(ws[0]!.note).toBeNull();
    });
  });

  // por último: esgota o limite da sessão da mentora 2 (os pedidos dela nos testes acima já contam na janela)
  it("E51 tem limite próprio por sessão (30 por minuto): passou disso, 429", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await walkIn({}, 1)).status);
    expect(new Set(codes)).toEqual(new Set([422, 429]));
    expect(codes.indexOf(429)).toBeGreaterThan(20);
    expect(codes.slice(codes.indexOf(429)).every((s) => s === 429)).toBe(true);
    // a mentora 1 não é afetada
    expect((await walkIn({}, 0)).status).toBe(422);
  });
});
