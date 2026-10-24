import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { openSse } from "../helpers/sse.js";

const api = await loadApi();

describe.skipIf(!api)("tempo real: SSE alimentado por Change Streams (E27 mentora, E38 admin)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "sse", { mentors: 2, mentees: 3 });
  });
  afterAll(async () => b?.close());

  it("exige sessão e papel: sem cookie 401; participante/admin em E27 não entram", async () => {
    expect((await b.anon.get("/api/mentor/stream")).status).toBe(401);
    const admin = await openSse(b.app, "/api/mentor/stream", b.admin.cookie!);
    expect(admin.status).toBe(403);
    admin.close();
  });

  it("E27: conecta (ready) e entrega queue.removed + appointment.updated, sem contato", async () => {
    const mA = await openSse(b.app, "/api/mentor/stream", b.mentor[0]!.cookie!);
    const mB = await openSse(b.app, "/api/mentor/stream", b.mentor[1]!.cookie!);
    expect(mA.status).toBe(200);
    await mA.waitFor((f) => f.event === "ready");
    await mB.waitFor((f) => f.event === "ready");

    const r = await b.invite(0, 0, 2, 0);
    expect(r.status, JSON.stringify(r.body)).toBe(201);

    // a outra mentora vê a participante sair da fila e quem a escolheu (M4)
    const removed = await mB.waitFor((f) => f.event === "queue.removed");
    expect(removed.data.menteeId).toBe(String(b.w.mentees[0]!.doc._id));
    expect(removed.data.reason).toBe("invited");
    expect(removed.data.byMe).toBe(false);
    expect(removed.data.byMentorName).toBe("Mentora 1");

    // a própria mentora recebe appointment.updated e byMe=true; id do frame = resume token
    const upd = await mA.waitFor((f) => f.event === "appointment.updated");
    expect(upd.data.appointment.status).toBe("invited");
    expect(upd.id).toBeTruthy();
    const own = await mA.waitFor((f) => f.event === "queue.removed");
    expect(own.data.byMe).toBe(true);

    // mentora B não recebe appointment.updated de outra mentora; nenhum frame vaza contato
    expect(mB.frames.some((f) => f.event === "appointment.updated")).toBe(false);
    for (const f of [...mA.frames, ...mB.frames]) {
      for (const m of b.w.mentees) {
        expect(f.raw).not.toContain(m.doc.email);
        expect(f.raw).not.toContain(m.doc.phone!);
      }
    }
    mA.close();
    mB.close();
  });

  it("E27: nova inscrição (E02) aparece como queue.added", async () => {
    const mB = await openSse(b.app, "/api/mentor/stream", b.mentor[1]!.cookie!);
    await mB.waitFor((f) => f.event === "ready");
    const r = await b.anon.post("/api/public/mentees", {
      name: "Nova Inscrita", email: "nova@exemplo.test", phone: "(81) 98888-7777", area: "dados", preferredPeriod: "any",
      consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const added = await mB.waitFor((f) => f.event === "queue.added");
    expect(added.data.mentee.name).toBe("Nova Inscrita");
    expect(added.raw).not.toContain("nova@exemplo.test");
    mB.close();
  });

  it("E38: admin recebe appointment.updated COM contato; resume por Last-Event-ID não perde eventos", async () => {
    const adm = await openSse(b.app, "/api/admin/stream", b.admin.cookie!);
    expect(adm.status).toBe(200);
    await adm.waitFor((f) => f.event === "ready");
    const r = await b.invite(1, 1, 5, 3);
    expect(r.status).toBe(201);
    const upd = await adm.waitFor((f) => f.event === "appointment.updated" && f.data.appointment.mentee.name === "Participante 2");
    expect(upd.raw).toContain(b.w.mentees[1]!.doc.email);
    const lastId = upd.id!;
    adm.close();

    // evento ocorre com o admin desconectado
    const r2 = await b.invite(1, 2, 6, 4);
    expect(r2.status).toBe(201);
    const again = await openSse(b.app, "/api/admin/stream", b.admin.cookie!, { "last-event-id": lastId });
    const missed = await again.waitFor((f) => f.event === "appointment.updated" && f.data.appointment.mentee.name === "Participante 3");
    expect(missed.data.appointment.status).toBe("invited");
    again.close();
  });

  it("E38 GET /admin/schedule devolve a grade com as mentorias com slotLock", async () => {
    const r = await b.admin.get("/api/admin/schedule");
    expect(r.status).toBe(200);
    expect(r.body.slots).toHaveLength(12);
    expect(r.body.tables).toHaveLength(20);
    expect(r.body.appointments.length).toBeGreaterThanOrEqual(3);
  });
});
