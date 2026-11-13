import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatTimeBR } from "@tw/shared";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN27 · Com o cancelamento pela mentora ligado (RN25), cada cancelamento dela (E26 `cancel`, de convite ou de
 * mentoria confirmada) avisa as administradoras ativas por e-mail (layout 15) e a auditoria `appointment.cancel`
 * leva a frase em `after.summary`. Cancelamentos da participante ou da administradora não geram esse aviso.
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const TYPE = "mentor_cancelled" as never;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN27 · cancelamento pela mentora avisa as administradoras", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentee = (i: number) => b.w.mentees[i]!;
  const mentor = () => b.w.mentors[0]!;
  const apptOf = async (i: number) => (await c.appointments.findOne({ menteeId: mentee(i).doc._id }, { sort: { createdAt: -1 } }))!;
  const invite = async (mi: number, si: number) => {
    const r = await b.invite(0, mi, si, mi);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return apptOf(mi);
  };
  const cancel = (id: unknown, body: Record<string, unknown> = {}) => b.mentor[0]!.patch(`/api/mentor/appointments/${id}`, { action: "cancel", ...body });
  const send = async () => {
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    return n.sent.filter((s: any) => s.type === "mentor_cancelled") as any[];
  };
  const h = (d: Date) => formatTimeBR(d, "America/Recife");

  beforeAll(async () => {
    b = await bootApi(api!, "rn27-cancelamento", { mentors: 1, mentees: 5 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => b?.close());

  it("mentoria confirmada cancelada com motivo: e-mail a cada administradora ativa e auditoria explícita", async () => {
    const appt = await invite(0, 2);
    const ok = await Client.asMentee(b.app, mentee(0).token).post("/api/public/me/actions", { action: "accept" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const r = await cancel(appt._id, { reason: "Passei mal." });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const items = await c.outbox.find({ type: TYPE }).toArray();
    expect(items.map((i) => i.to).sort()).toEqual(["admin@techwoman.test", "super@techwoman.test"]);
    expect(items[0]).toMatchObject({ menteeId: null, appointmentId: appt._id, payload: { wasInvite: false, justification: "Passei mal." } });

    const audit = await c.auditLogs.findOne({ action: "appointment.cancel", entityId: String(appt._id) });
    expect(audit).toMatchObject({ actorRole: "mentor" });
    expect((audit!.after as any).summary).toBe(`${mentor().name} cancelou a mentoria das ${h(appt.startAt)} com ${mentee(0).doc.name} (Mesa 1). Motivo: Passei mal.`);
    const view = await b.admin.get("/api/admin/audit?action=appointment.cancel");
    expect(view.body.items[0].after.summary).toContain("cancelou a mentoria");

    const mails = await send();
    expect(mails).toHaveLength(2);
    expect(mails[0].subject).toBe(`${mentor().name} cancelou a mentoria das ${h(appt.startAt)}`);
    expect(mails[0].text).toContain(`${mentor().name} cancelou a mentoria das ${h(appt.startAt)} com ${mentee(0).doc.name}, na Mesa 1, em 14/11 às 8h00`);
    expect(mails[0].text).toContain("Motivo: Passei mal.");
    expect(mails[0].text).toContain(`${BASE}/admin/mapa`);
  });

  it("convite cancelado sem motivo: 'o convite' e 'não informado'", async () => {
    const appt = await invite(1, 3);
    expect((await cancel(appt._id)).status).toBe(200);
    const audit = await c.auditLogs.findOne({ action: "appointment.cancel", entityId: String(appt._id) });
    expect((audit!.after as any).summary).toContain("cancelou o convite");
    expect((audit!.after as any).summary).toContain("Motivo: não informado");
    const mails = (await send()).filter((m) => m.subject.includes("o convite"));
    expect(mails).toHaveLength(2);
    expect(mails[0].text).toContain("Motivo: não informado");
  });

  it("cancelamento pela administradora (E39) ou pela participante não gera o aviso", async () => {
    await c.outbox.deleteMany({});
    const a = await invite(2, 4);
    expect((await b.admin.patch(`/api/admin/appointments/${a._id}`, { action: "cancel" })).status).toBe(200);
    const a2 = await invite(3, 5);
    expect((await Client.asMentee(b.app, mentee(3).token).post("/api/public/me/actions", { action: "decline", reason: "schedule" })).status).toBe(200);
    expect(a2).toBeTruthy();
    expect(await c.outbox.countDocuments({ type: TYPE })).toBe(0);
  });
});
