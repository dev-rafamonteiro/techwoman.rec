import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { menteeDoc } from "../helpers/seed.js";
import { MENTEES_TEXT_INDEX, ensureSearchIndex, waitForCount } from "../helpers/search.js";
import { getCollections } from "../../src/db/collections.js";
import type { MenteeDoc } from "../../src/db/types.js";

/**
 * RN21 · Atendimento fora da mesa (E50–E53) sobre o mongo-local com Atlas Search:
 * busca tolerante a erro sem contato e sem canceladas; a participante sempre termina atendida (`done`) e nunca volta
 * à fila (nem pelas ações de P6); convite ou mentoria confirmada na mesa é cancelada (aviso à mentora da mesa, nada à
 * participante); e-mail `walk_in_done` (layout 10) com a mentora e o LinkedIn, um por atendimento, sem `registered`;
 * remoção pelo admin descadastra e manda `walk_in_removed` (layout 11); avaliação (E09) e números (E30, E31, E37, E49).
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const LINKEDIN = "https://www.linkedin.com/in/mentora-um";
const T = (t: string) => t as never;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN21 · atendimento fora da mesa (E50–E53)", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const seeded = new Map<string, { token: string; doc: MenteeDoc }>();
  const doc = (name: string) => seeded.get(name)!.doc;
  const id = (name: string) => String(doc(name)._id);
  const fresh = (name: string) => c.mentees.findOne({ _id: doc(name)._id });
  const asMentee = (name: string) => Client.asMentee(b.app, seeded.get(name)!.token);
  const search = (q: string, who = 0) => b.mentor[who]!.get(`/api/mentor/mentees/search?q=${encodeURIComponent(q)}`);
  const walkIn = (body: unknown, who = 0, headers?: Record<string, string>) => b.mentor[who]!.post("/api/mentor/walk-ins", body, headers);
  const del = (walkInId: string) => b.admin.req("DELETE", `/api/admin/walk-ins/${walkInId}`);
  const mailOf = (menteeId: ObjectId, type: string) => c.outbox.find({ menteeId, type: T(type) }).toArray();
  const queueNames = async (who = 1) => ((await b.mentor[who]!.get("/api/mentor/queue")).body.items as any[]).map((i) => i.name);
  const run = async () => {
    const n = new api!.MemoryNotifier!();
    const res = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    return { n, res };
  };
  const invite = (who: number, name: string, slot: number, table: number) =>
    b.mentor[who]!.post("/api/mentor/appointments", { menteeId: id(name), slotId: b.w.slotIds[slot]!, tableId: String(b.w.tables[table]!._id) });

  beforeAll(async () => {
    b = await bootApi(api!, "rn21", { mentors: 3, mentees: 0 });
    c = getCollections(b.t.db);
    // a mentora 1 tem LinkedIn e organização (vão no e-mail e em P6)
    await c.users.updateOne({ _id: b.w.mentors[0]!._id }, { $set: { linkedin: LINKEDIN, organization: "Org Exemplo" } });
    const base = Date.now() - 3600_000;
    const seeds: [string, Partial<MenteeDoc>][] = [
      ["Joana Lima", {}],
      ["Joana Lins", { status: "cancelled" }],
      ["Carla Moura", {}],
      ["Renata Prado", {}],
      ["Beatriz Campos", { priority: true, priorityReason: "manual" }],
      ["Sofia Andrade", {}],
      ["Helena Dias", { status: "no_show" }],
      ["Iara Costa", {}],
      ["Paula Reis", {}],
      ["Clara Nunes", {}],
    ];
    seeds.forEach(([name, over], i) => seeded.set(name, menteeDoc(i + 1, { name, queuedAt: new Date(base + i * 1000), ...over } as Partial<MenteeDoc>)));
    await c.mentees.insertMany([...seeded.values()].map((m) => m.doc));
    // Renata: convidada pela mentora 2 e confirmada; Iara: só convidada pela mentora 2; Paula: convidada pela mentora 1
    expect((await invite(1, "Renata Prado", 5, 0)).status).toBe(201);
    expect((await asMentee("Renata Prado").post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    expect((await invite(1, "Iara Costa", 6, 1)).status).toBe(201);
    expect((await invite(0, "Paula Reis", 7, 2)).status).toBe(201);
    // Clara: mentoria concluída na mesa com a mentora 3
    const cl = await invite(2, "Clara Nunes", 5, 3);
    expect(cl.status).toBe(201);
    expect((await asMentee("Clara Nunes").post("/api/public/me/actions", { action: "accept" })).status).toBe(200);
    expect((await b.mentor[2]!.patch(`/api/mentor/appointments/${cl.body.appointment.id}`, { action: "finish" })).status).toBe(200);
    const col = b.t.db.collection("mentees");
    await ensureSearchIndex(col, MENTEES_TEXT_INDEX);
    await waitForCount(() => col.aggregate([{ $search: { index: "mentees_text", text: { query: "Clara Nunes", path: "name" } } }]).toArray(), 1);
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
      expect(r.body.items.find((i: any) => i.mentee.name === "Joana Lima")).toMatchObject({ situation: "waiting", startAt: null, scheduled: null });
      for (const q of ["Joana", "Joana Lins", "Lins"]) expect(((await search(q)).body.items as any[]).map((i) => i.mentee.name), q).not.toContain("Joana Lins");
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

    it("mentoria marcada traz horário, mesa e mentora (M7 avisa que será cancelada); não compareceu aparece como no_show", async () => {
      const renata = ((await search("Renata Prado")).body.items as any[]).find((i) => i.mentee.name === "Renata Prado");
      const appt = (await c.appointments.findOne({ menteeId: doc("Renata Prado")._id }))!;
      expect(renata).toMatchObject({ situation: "scheduled", startAt: appt.startAt.toISOString(), scheduled: { appointmentId: String(appt._id), startAt: appt.startAt.toISOString(), tableLabel: "Mesa 1", mentorName: "Mentora 2" } });
      const iara = ((await search("Iara Costa")).body.items as any[]).find((i) => i.mentee.name === "Iara Costa");
      expect(iara.scheduled).toMatchObject({ tableLabel: "Mesa 2", mentorName: "Mentora 2" });
      expect(((await search("Helena Dias")).body.items as any[]).find((i) => i.mentee.name === "Helena Dias").situation).toBe("no_show");
    });

    it("mínimo de 2 caracteres (422); só mentora (admin 403)", async () => {
      expect((await search("J")).status).toBe(422);
      expect((await b.admin.get("/api/mentor/mentees/search?q=Joana")).status).toBe(403);
    });
  });

  describe("E51 · registrar", () => {
    it("participante na fila -> atendida (sai da fila), com walk_in, auditoria e um e-mail walk_in_done", async () => {
      const r = await walkIn({ menteeId: id("Joana Lima"), note: "  Conversamos sobre currículo  " });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "existing", linkedExisting: false, name: "Joana Lima", previousStatus: "waiting", status: "done", cancelledAppointment: null });
      expect(r.body.walkIn).toMatchObject({ note: "Conversamos sobre currículo", mentee: { name: "Joana Lima", status: "done" } });
      expect(JSON.stringify(r.body)).not.toMatch(/"email"|"phone"/);
      const wid = r.body.walkIn.id as string;
      const m = (await fresh("Joana Lima"))!;
      expect([m.status, m.currentAppointmentId]).toEqual(["done", null]);
      expect(await c.walkIns.findOne({ _id: new ObjectId(wid) })).toMatchObject({ previousMenteeStatus: "waiting", mentorId: b.w.mentors[0]!._id, deletedAt: null, deletedBy: null });
      expect(await c.appointments.countDocuments({ menteeId: m._id })).toBe(0);
      expect(await c.auditLogs.countDocuments({ action: "walk_in.create", entityId: wid })).toBe(1);
      expect(await c.auditLogs.countDocuments({ action: "mentee.walk_in_done", entityId: String(m._id) })).toBe(1);
      const mail = await c.outbox.find({ menteeId: m._id }).toArray();
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ type: "walk_in_done", channel: "email", to: m.email, status: "pending", payload: { walkInId: wid }, dedupeKey: `walk_in_done:${wid}:email` });
      expect(await queueNames(1)).not.toContain("Joana Lima");
      expect(((await search("Joana Lima")).body.items as any[]).find((i) => i.mentee.name === "Joana Lima").situation).toBe("walked_in_by_me");
      expect(((await search("Joana Lima", 1)).body.items as any[]).find((i) => i.mentee.name === "Joana Lima").situation).toBe("done");
    });

    it("o worker envia o layout 10: agradecimento, mentora com organização, LinkedIn e link pessoal curto (/l/)", async () => {
      const { n } = await run();
      const sent = n.sent.filter((s: any) => s.type === "walk_in_done" && s.to === doc("Joana Lima").email);
      expect(sent).toHaveLength(1);
      const msg = sent[0];
      expect(msg.subject).toBe("Obrigada pela conversa com Mentora 1");
      expect(msg.text).toContain("Obrigada por participar, Joana Lima!");
      expect(msg.text).toContain("Você foi atendida por Mentora 1 (Org Exemplo) fora das mesas");
      expect(msg.text).toContain(`Ver o LinkedIn de Mentora 1: ${LINKEDIN}`);
      expect(msg.text).toMatch(new RegExp(`Ver minha página e avaliar: ${BASE}/l/\\S+`));
      expect(msg.html).toContain(`href="${LINKEDIN}"`);
      expect(msg.html).not.toMatch(/\{\{|\}\}/);
    });

    it("mesma mentora e participante de novo -> 409 sem novo e-mail; outra mentora (sem LinkedIn) registra e manda outro e-mail, sem o bloco do LinkedIn", async () => {
      const r = await walkIn({ menteeId: id("Joana Lima") });
      expect([r.status, r.body.code]).toEqual([409, "CONFLICT"]);
      expect(r.body.message).toMatch(/já registrou/);
      expect(await mailOf(doc("Joana Lima")._id, "walk_in_done")).toHaveLength(1);
      const other = await walkIn({ menteeId: id("Joana Lima") }, 1);
      expect(other.status).toBe(201);
      expect(other.body).toMatchObject({ previousStatus: "done", status: "done" });
      expect(await mailOf(doc("Joana Lima")._id, "walk_in_done")).toHaveLength(2);
      const { n } = await run();
      const msg = n.sent.find((s: any) => s.type === "walk_in_done" && s.to === doc("Joana Lima").email)!;
      expect(msg.text).toContain("Você foi atendida por Mentora 2 fora das mesas");
      expect(msg.text).not.toMatch(/LinkedIn|\(\)/);
    });

    it("mentoria confirmada na mesa com outra mentora: é cancelada (mesa e horário livres), ela fica atendida, a mentora da mesa é avisada e ela só recebe o walk_in_done", async () => {
      const before = await c.outbox.find({ menteeId: doc("Renata Prado")._id }).toArray();
      const appt = (await c.appointments.findOne({ menteeId: doc("Renata Prado")._id }))!;
      const r = await walkIn({ menteeId: id("Renata Prado") });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ previousStatus: "confirmed", status: "done", cancelledAppointment: { appointmentId: String(appt._id), tableLabel: "Mesa 1", mentorName: "Mentora 2", startAt: appt.startAt.toISOString() } });
      const m = (await fresh("Renata Prado"))!;
      expect([m.status, m.currentAppointmentId, m.priority]).toEqual(["done", null, false]);
      const a = (await c.appointments.findOne({ _id: appt._id }))!;
      expect(a.status).toBe("cancelled");
      expect(a.slotLock).toBeUndefined();
      expect(a.menteeLock).toBeUndefined();
      expect(a.history.at(-1)).toMatchObject({ from: "confirmed", to: "cancelled", reason: "walk_in" });
      expect(await c.auditLogs.countDocuments({ action: "appointment.walk_in_cancel", entityId: String(appt._id) })).toBe(1);
      const after = await c.outbox.find({ menteeId: m._id }).toArray();
      expect(after.filter((o) => !before.some((x) => x._id.equals(o._id))).map((o) => o.type)).toEqual(["walk_in_done"]);
      const notice = await c.outbox.find({ type: "mentor_slot_released", appointmentId: appt._id }).toArray();
      expect(notice).toHaveLength(1);
      expect(notice[0]).toMatchObject({ to: b.w.mentors[1]!.email, userId: b.w.mentors[1]!._id, menteeId: null, payload: { reason: "walked_in_elsewhere" } });
      // mesa e horário livres: a mentora 2 convida outra pessoa no mesmo horário e mesa
      expect((await invite(1, "Sofia Andrade", 5, 0)).status).toBe(201);
      const { n } = await run();
      const mentorMail = n.sent.find((s: any) => s.type === "mentor_slot_released" && s.to === b.w.mentors[1]!.email)!;
      expect(mentorMail.subject).toBe("Renata Prado foi atendida fora da mesa");
      expect(mentorMail.text).toContain("Renata Prado foi atendida fora da mesa por outra mentora, e a mentoria das");
      expect(n.sent.filter((s: any) => s.to === m.email).map((s: any) => s.type)).toEqual(["walk_in_done"]);
    });

    it("convite pendente com outra mentora: cancelado, aviso à mentora do convite", async () => {
      const appt = (await c.appointments.findOne({ menteeId: doc("Iara Costa")._id }))!;
      const r = await walkIn({ menteeId: id("Iara Costa") });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ previousStatus: "invited", status: "done", cancelledAppointment: { tableLabel: "Mesa 2", mentorName: "Mentora 2" } });
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
      expect(await c.outbox.countDocuments({ type: "mentor_slot_released", appointmentId: appt._id, "payload.reason": "walked_in_elsewhere" })).toBe(1);
      expect((await c.outbox.find({ menteeId: doc("Iara Costa")._id, type: { $nin: ["invite"] } }).toArray()).map((o) => o.type)).toEqual(["walk_in_done"]);
    });

    it("convite da própria mentora que registra: cancelado sem aviso a ela", async () => {
      const appt = (await c.appointments.findOne({ menteeId: doc("Paula Reis")._id }))!;
      const r = await walkIn({ menteeId: id("Paula Reis") });
      expect(r.status).toBe(201);
      expect(r.body.cancelledAppointment).toMatchObject({ mentorName: "Mentora 1" });
      expect((await c.appointments.findOne({ _id: appt._id }))!.status).toBe("cancelled");
      expect(await c.outbox.countDocuments({ type: "mentor_slot_released", appointmentId: appt._id })).toBe(0);
    });

    it("já concluída na mesa: continua concluída e a mentoria da mesa não muda", async () => {
      const r = await walkIn({ menteeId: id("Clara Nunes") });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ previousStatus: "done", status: "done", cancelledAppointment: null });
      expect((await c.appointments.findOne({ menteeId: doc("Clara Nunes")._id }))!.status).toBe("done");
    });

    it("cancelada não pode ser escolhida (409 INVALID_STATE); participante inexistente 404", async () => {
      const r = await walkIn({ menteeId: id("Joana Lins") });
      expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
      expect((await walkIn({ menteeId: String(new ObjectId()) })).status).toBe(404);
      expect(await c.walkIns.countDocuments({ menteeId: doc("Joana Lins")._id })).toBe(0);
    });

    it("cadastro rápido com inscrições fechadas (RN02 não vale): cria atendida, aceite colhido pela mentora e só o e-mail walk_in_done (sem registered)", async () => {
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
        expect(mail.map((o) => [o.type, o.channel, o.to])).toEqual([["walk_in_done", "email", "larissa.novaes@exemplo.test"]]);
        expect(await c.auditLogs.countDocuments({ action: "mentee.register_by_staff", entityId: String(m._id) })).toBe(1);
        expect(await c.walkIns.countDocuments({ menteeId: m._id, previousMenteeStatus: null })).toBe(1);
      } finally {
        await c.events.updateOne({}, { $set: { registrationOpen: true } });
      }
    });

    it("cadastro rápido com e-mail já inscrito (RN01): liga à inscrição existente, que fica atendida, sem criar outra; e-mail walk_in_done", async () => {
      const carla = doc("Carla Moura");
      const before = await c.mentees.countDocuments({});
      const r = await walkIn({ newMentee: { name: "Carla M.", email: carla.email.toUpperCase(), area: "dados" }, consentAccepted: true });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "linked", linkedExisting: true, name: "Carla Moura", previousStatus: "waiting", status: "done" });
      expect(await c.mentees.countDocuments({})).toBe(before);
      expect((await c.outbox.find({ menteeId: carla._id }).toArray()).map((o) => o.type)).toEqual(["walk_in_done"]);
      expect((await fresh("Carla Moura"))!.name).toBe("Carla Moura");
    });

    it("cadastro rápido com e-mail de quem não compareceu (no_show): reativa como atendida; só walk_in_done", async () => {
      const helena = doc("Helena Dias");
      const r = await walkIn({ newMentee: { name: "Helena Dias", email: helena.email, area: "dados" }, consentAccepted: true });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ outcome: "reactivated", linkedExisting: false, previousStatus: "no_show", status: "done" });
      const after = (await fresh("Helena Dias"))!;
      expect([after.status, after.linkSendCount]).toEqual(["done", helena.linkSendCount + 1]);
      expect((await c.outbox.find({ menteeId: helena._id }).toArray()).map((o) => o.type)).toEqual(["walk_in_done"]);
    });

    it("validação: sem aceite, área desconhecida ou celular inválido -> 422; admin não registra (403)", async () => {
      const nm = { name: "Teste Silva", email: "teste.silva@exemplo.test", area: "dados" };
      expect((await walkIn({ newMentee: nm })).status).toBe(422);
      expect((await walkIn({ newMentee: { ...nm, area: "astronomia" }, consentAccepted: true })).status).toBe(422);
      expect((await walkIn({ newMentee: { ...nm, phone: "(00) 1234-5678" }, consentAccepted: true })).status).toBe(422);
      expect((await b.admin.post("/api/mentor/walk-ins", { menteeId: id("Beatriz Campos") })).status).toBe(403);
      expect(await c.mentees.countDocuments({ emailNorm: nm.email })).toBe(0);
    });

    it("Idempotency-Key: repetir o mesmo pedido devolve a mesma resposta sem duplicar atendimento nem e-mail", async () => {
      const h = { "Idempotency-Key": "rn21-sofia-1" };
      const a = await walkIn({ menteeId: id("Sofia Andrade") }, 2, h);
      const again = await walkIn({ menteeId: id("Sofia Andrade") }, 2, h);
      expect([a.status, again.status]).toEqual([201, 201]);
      expect(again.headers["idempotent-replay"]).toBe("true");
      expect(again.body.walkIn.id).toBe(a.body.walkIn.id);
      // Sofia tinha sido convidada pela mentora 2 no horário que a Renata liberou: o convite foi cancelado
      expect(a.body.cancelledAppointment).toMatchObject({ mentorName: "Mentora 2" });
      expect(await c.walkIns.countDocuments({ menteeId: doc("Sofia Andrade")._id })).toBe(1);
      expect(await mailOf(doc("Sofia Andrade")._id, "walk_in_done")).toHaveLength(1);
    });

    it("E52 · lista os atendimentos da própria mentora, do mais recente ao mais antigo, sem contato", async () => {
      const r = await b.mentor[0]!.get("/api/mentor/walk-ins");
      expect(r.status).toBe(200);
      expect((r.body.items as any[]).map((i) => i.mentee.name)).toEqual(["Helena Dias", "Carla Moura", "Larissa Novaes", "Clara Nunes", "Paula Reis", "Iara Costa", "Renata Prado", "Joana Lima"]);
      expect(JSON.stringify(r.body)).not.toMatch(/"email"|"phone"/);
      expect((await b.mentor[1]!.get("/api/mentor/walk-ins")).body.items.map((i: any) => i.mentee.name)).toEqual(["Joana Lima"]);
    });
  });

  describe("P6 · quem foi atendida fora da mesa nunca volta à fila", () => {
    it("E03 mostra a mentora, a organização e o LinkedIn; ações de P6 (E04, E07, E08) não a devolvem à fila", async () => {
      const me = asMentee("Renata Prado");
      const state = await me.get("/api/public/me");
      expect(state.status).toBe(200);
      expect(state.body).toMatchObject({ mentee: { status: "done" }, appointment: null, walkIn: { mentorName: "Mentora 1", mentorOrganization: "Org Exemplo", mentorLinkedin: LINKEDIN }, feedback: null });
      for (const body of [{ action: "accept" }, { action: "decline", reason: "schedule" }, { action: "cancel" }, { action: "reschedule" }, { action: "update_preference", preferredPeriod: "morning" }]) {
        const r = await me.post("/api/public/me/actions", body);
        expect(r.status, `${JSON.stringify(body)} ${JSON.stringify(r.body)}`).toBe(409);
      }
      expect((await me.get("/api/public/me/slots")).status).toBe(409);
      expect((await me.post("/api/public/me/book", { slotId: b.w.slotIds[8]! })).status).toBe(409);
      expect((await fresh("Renata Prado"))!.status).toBe("done");
      expect(await queueNames(1)).not.toContain("Renata Prado");
    });

    it("inscrever de novo pelo P4 (E02) com o mesmo e-mail só reenvia o link; reenviar o link pelo admin (E36) também não mexe no status", async () => {
      const joana = doc("Joana Lima");
      const reg = await b.anon.post("/api/public/mentees", {
        name: joana.name, email: joana.email, phone: "(81) 99910-0001", area: "dados", slotId: "s12", mentorId: String(b.w.mentors[0]!._id),
        consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
      });
      expect(reg.status, JSON.stringify(reg.body)).toBe(200);
      expect(reg.body.status).toBe("already_registered");
      expect((await b.admin.patch(`/api/admin/mentees/${joana._id}`, { action: "resend_link" })).status).toBe(200);
      expect((await fresh("Joana Lima"))!.status).toBe("done");
      expect(await queueNames(0)).not.toContain("Joana Lima");
    });

    it("E09 · avalia a mentora do atendimento; A10 traz a mentora", async () => {
      const r = await asMentee("Renata Prado").post("/api/public/me/feedback", { event: 5, talk: 4, mentoring: 5, comment: "Muito boa a conversa" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const fb = (await c.feedbacks.findOne({ _id: doc("Renata Prado")._id }))!;
      expect(fb).toMatchObject({ appointmentId: null, mentorId: b.w.mentors[0]!._id });
      expect(fb.walkInId).toBeInstanceOf(ObjectId);
      const a10 = await b.admin.get("/api/admin/feedback");
      expect((a10.body.items as any[]).find((i) => i.menteeName === "Renata Prado").mentorName).toBe("Mentora 1");
    });
  });

  describe("números: atendida fora da mesa conta como atendida, sem contar duas vezes", () => {
    it("A1 (E30) concluídas = participantes done, com a divisão na mesa / fora da mesa; A2 (E31) concluídas inclui fora da mesa; E37 marca fora da mesa e a mentora", async () => {
      const done = await c.mentees.countDocuments({ status: "done" });
      const dash = await b.admin.get("/api/admin/dashboard");
      expect(dash.body.counts.walkIns).toBe(await c.walkIns.countDocuments({ deletedAt: null }));
      expect(dash.body.counts.done).toBe(1); // mentorias concluídas na mesa (Clara)
      // Clara (na mesa e também fora dela) conta uma vez, na mesa
      expect(dash.body.counts.attended).toEqual({ total: done, atTable: 1, walkIn: done - 1 });
      const mentors = new Map(((await b.admin.get("/api/admin/mentors")).body.items as any[]).map((m) => [m.name, m]));
      const m1 = await c.walkIns.countDocuments({ deletedAt: null, mentorId: b.w.mentors[0]!._id });
      expect(mentors.get("Mentora 1")).toMatchObject({ doneCount: 0, walkInCount: m1, attendedCount: m1 });
      expect(mentors.get("Mentora 3")).toMatchObject({ doneCount: 1, walkInCount: 1, attendedCount: 2 });
      expect((await b.admin.get("/api/admin/feedback")).body.doneCount).toBe(done);
      const csv = await b.admin.get("/api/admin/mentees/export.csv");
      const lines = String(csv.body).replace(/^﻿/, "").trim().split("\r\n");
      const header = lines[0]!.split(",");
      const row = (name: string) => { const cols = lines.find((l) => l.startsWith(`${name},`))!.split(","); return (k: string) => cols[header.indexOf(k)]; };
      expect(header.at(-1)).toBe("fora_da_mesa");
      expect(row("Renata Prado")("status")).toBe("done (fora da mesa)");
      expect(row("Renata Prado")("mentora")).toBe("Mentora 1");
      expect(row("Joana Lima")("fora_da_mesa")).toBe("Mentora 1 / Mentora 2");
      expect(row("Clara Nunes")("status")).toBe("done");
      expect(row("Clara Nunes")("mentora")).toBe("Mentora 3");
    });
  });

  describe("E53 · admin", () => {
    it("lista com mentora e e-mail da participante; filtra por mentora; mentora não acessa", async () => {
      const all = await b.admin.get("/api/admin/walk-ins");
      expect(all.status).toBe(200);
      expect(all.body.items).toHaveLength(await c.walkIns.countDocuments({ deletedAt: null }));
      const larissa = (all.body.items as any[]).find((i) => i.mentee.name === "Larissa Novaes");
      expect(larissa).toMatchObject({ mentor: { name: "Mentora 1" }, mentee: { email: "larissa.novaes@exemplo.test", status: "done" }, note: "Primeira conversa" });
      const only = await b.admin.get(`/api/admin/walk-ins?mentorId=${b.w.mentors[1]!._id}`);
      expect((only.body.items as any[]).map((i) => i.mentor.name)).toEqual(["Mentora 2"]);
      expect((await b.mentor[0]!.get("/api/admin/walk-ins")).status).toBe(403);
    });

    it("remover o único atendimento descadastra a participante, tira dos números e manda walk_in_removed; o walk_in_done pendente não sai", async () => {
      const bea = doc("Beatriz Campos");
      const r = await walkIn({ menteeId: String(bea._id) });
      expect(r.body.status).toBe("done");
      const wid = r.body.walkIn.id as string;
      const attendedBefore = (await b.admin.get("/api/admin/dashboard")).body.counts.attended.total;
      const d = await del(wid);
      expect(d.status, JSON.stringify(d.body)).toBe(200);
      expect(d.body).toEqual({ ok: true, deregistered: true });
      const m = (await c.mentees.findOne({ _id: bea._id }))!;
      expect([m.status, m.priority, m.currentAppointmentId]).toEqual(["cancelled", false, null]);
      expect(await c.appointments.countDocuments({ menteeId: bea._id, menteeLock: true })).toBe(0);
      const w = (await c.walkIns.findOne({ _id: new ObjectId(wid) }))!;
      expect(w.deletedAt).toBeInstanceOf(Date);
      expect(String(w.deletedBy)).toBe(String((await c.users.findOne({ email: "admin@techwoman.test" }))!._id));
      expect(await c.auditLogs.countDocuments({ action: "walk_in.delete", entityId: wid })).toBe(1);
      expect(await c.auditLogs.countDocuments({ action: "mentee.walk_in_deregister", entityId: String(bea._id) })).toBe(1);
      expect((await mailOf(bea._id, "walk_in_removed")).map((o) => o.dedupeKey)).toEqual([`walk_in_removed:${wid}:email`]);
      expect((await b.admin.get("/api/admin/dashboard")).body.counts.attended.total).toBe(attendedBefore - 1);
      expect((await del(wid)).status).toBe(404);
      const { n } = await run();
      const toBea = n.sent.filter((s: any) => s.to === bea.email);
      expect(toBea.map((s: any) => s.type)).toEqual(["walk_in_removed"]);
      expect(toBea[0].subject).toBe("Sua inscrição na mentoria do Tech Woman foi removida");
      expect(toBea[0].text).toContain(`Fazer nova inscrição: ${BASE}/mentoria/inscricao`);
      expect((await mailOf(bea._id, "walk_in_done"))[0]).toMatchObject({ status: "skipped", lastError: "atendimento fora da mesa removido" });
    });

    it("descadastrada pode se inscrever de novo pelo P4 (E02) com o mesmo e-mail e já sai confirmada (RN24)", async () => {
      const bea = doc("Beatriz Campos");
      const reg = await b.anon.post("/api/public/mentees", {
        name: bea.name, email: bea.email, phone: "(81) 99910-0005", area: "dados", slotId: "s12", mentorId: String(b.w.mentors[0]!._id),
        consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
      });
      expect(reg.status, JSON.stringify(reg.body)).toBe(201);
      expect((await c.mentees.findOne({ _id: bea._id }))!.status).toBe("confirmed");
      expect(await c.mentees.countDocuments({ emailNorm: bea.emailNorm })).toBe(1);
      expect(await queueNames(1)).not.toContain("Beatriz Campos");
    });

    it("com outro atendimento ativo, remover não descadastra nem manda e-mail", async () => {
      const joana = doc("Joana Lima");
      const mine = (await c.walkIns.findOne({ menteeId: joana._id, mentorId: b.w.mentors[0]!._id, deletedAt: null }))!;
      const d = await del(String(mine._id));
      expect(d.body).toEqual({ ok: true, deregistered: false });
      expect((await fresh("Joana Lima"))!.status).toBe("done");
      expect(await mailOf(joana._id, "walk_in_removed")).toHaveLength(0);
    });

    it("com mentoria concluída na mesa, remover não descadastra", async () => {
      const clara = (await c.walkIns.findOne({ menteeId: doc("Clara Nunes")._id, deletedAt: null }))!;
      expect((await del(String(clara._id))).body).toEqual({ ok: true, deregistered: false });
      expect((await fresh("Clara Nunes"))!.status).toBe("done");
    });

    it("descadastrada com avaliação: a avaliação sai junto", async () => {
      const w = (await c.walkIns.findOne({ menteeId: doc("Renata Prado")._id, deletedAt: null }))!;
      expect(await c.feedbacks.countDocuments({ _id: doc("Renata Prado")._id })).toBe(1);
      expect((await del(String(w._id))).body).toEqual({ ok: true, deregistered: true });
      expect(await c.feedbacks.countDocuments({ _id: doc("Renata Prado")._id })).toBe(0);
    });
  });

  it("anonimizar (E36) apaga a nota do atendimento e mantém o registro para os contadores", async () => {
    const larissa = (await c.mentees.findOne({ emailNorm: "larissa.novaes@exemplo.test" }))!;
    const r = await b.admin.patch(`/api/admin/mentees/${larissa._id}`, { action: "anonymize" });
    expect(r.status).toBe(200);
    const ws = await c.walkIns.find({ menteeId: larissa._id }).toArray();
    expect(ws).toHaveLength(1);
    expect(ws[0]!.note).toBeNull();
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
