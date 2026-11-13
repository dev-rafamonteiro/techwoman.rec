import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatTimeBR } from "@tw/shared";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN26 · Quando a própria mentora inclui ou tira horários da disponibilidade (E21, M3), cada administradora ativa
 * recebe um e-mail (layout 14) com o nome dela, os horários incluídos e tirados e quando salvou; a auditoria grava
 * `availability.add` / `availability.remove` com os horários e um resumo. Admin mexendo pela E32 não avisa.
 */
const api = await loadApi();
const BASE = "https://techwoman.dev";
const TYPE = "mentor_availability_changed" as never;

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("RN26 · disponibilidade alterada pela mentora avisa as administradoras", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentor = () => b.w.mentors[0]!;
  const put = (slotIds: string[]) => b.mentor[0]!.put("/api/mentor/availability", { slotIds });
  const startOf = async (id: string) => (await c.events.findOne({}))!.slots.find((s) => s.id === id)!.startAt;
  const h = async (id: string) => formatTimeBR(await startOf(id), "America/Recife");
  const send = async () => {
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now, config: { publicBaseUrl: BASE } });
    return n.sent.filter((s: any) => s.type === "mentor_availability_changed") as any[];
  };

  beforeAll(async () => {
    b = await bootApi(api!, "rn26-disponibilidade", { mentors: 1, mentees: 0 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => b?.close());
  beforeEach(async () => {
    await c.users.updateOne({ _id: mentor()._id }, { $set: { availability: ["s01", "s02"] } });
    await c.outbox.deleteMany({});
    await c.auditLogs.deleteMany({});
  });

  it("inclui e tira no mesmo salvamento: um e-mail por administradora ativa com as duas listas e o horário", async () => {
    const r = await put(["s02", "s03", "s04"]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const items = await c.outbox.find({ type: TYPE }).toArray();
    expect(items.map((i) => i.to).sort()).toEqual(["admin@techwoman.test", "super@techwoman.test"]);
    expect(new Set(items.map((i) => i.dedupeKey)).size).toBe(2);
    expect(items[0]).toMatchObject({ menteeId: null, appointmentId: null, payload: { mentorName: mentor().name, at: b.clock.now.toISOString() } });

    const mails = await send();
    expect(mails).toHaveLength(2);
    const m = mails[0];
    expect(m.subject).toBe(`${mentor().name} mudou a disponibilidade`);
    expect(m.text).toContain(`INCLUIU: ${await h("s03")}, ${await h("s04")}`);
    expect(m.text).toContain(`TIROU: ${await h("s01")}`);
    // NOW = 2026-11-14T11:00Z = 8h00 em Recife
    expect(m.text).toContain("QUANDO: 14/11 às 8h00");
    expect(m.text).toContain(`${BASE}/admin/mentoras`);
    expect(m.html).toContain(mentor().name);
  });

  it("auditoria explícita: availability.add e availability.remove com horários e resumo", async () => {
    expect((await put(["s02", "s03"])).status).toBe(200);
    const add = await c.auditLogs.findOne({ action: "availability.add" });
    const rem = await c.auditLogs.findOne({ action: "availability.remove" });
    expect(add).toMatchObject({ actorRole: "mentor", entity: "user", after: { horarios: [await h("s03")], slotIds: ["s03"] } });
    expect((add!.after as any).summary).toBe(`Incluiu ${await h("s03")} na disponibilidade de ${mentor().name}`);
    expect((rem!.after as any).summary).toBe(`Tirou ${await h("s01")} na disponibilidade de ${mentor().name}`);
    const view = await b.admin.get("/api/admin/audit?action=availability.remove");
    expect(view.status).toBe(200);
    expect(view.body.items[0].after.summary).toContain("Tirou");
  });

  it("só inclui: lista de retirados vem como 'nenhum'; só auditoria de inclusão", async () => {
    expect((await put(["s01", "s02", "s05"])).status).toBe(200);
    const [m] = await send();
    expect(m.text).toContain(`INCLUIU: ${await h("s05")}`);
    expect(m.text).toContain("TIROU: nenhum");
    expect(await c.auditLogs.countDocuments({ action: "availability.remove" })).toBe(0);
  });

  it("salvar sem mudança não avisa nem audita; administradora desativada não recebe", async () => {
    expect((await put(["s01", "s02"])).status).toBe(200);
    expect(await c.outbox.countDocuments({ type: TYPE })).toBe(0);
    expect(await c.auditLogs.countDocuments({ action: /^availability\./ })).toBe(0);
    await c.users.updateOne({ email: "admin@techwoman.test" }, { $set: { status: "disabled" } });
    try {
      expect((await put(["s01"])).status).toBe(200);
      expect((await c.outbox.find({ type: TYPE }).toArray()).map((i) => i.to)).toEqual(["super@techwoman.test"]);
    } finally {
      await c.users.updateOne({ email: "admin@techwoman.test" }, { $set: { status: "active" } });
    }
  });

  it("alteração feita pela administradora (E32) não gera o aviso", async () => {
    const r = await b.admin.patch(`/api/admin/mentors/${mentor()._id}`, { availability: ["s01", "s02", "s06"] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await c.outbox.countDocuments({ type: TYPE })).toBe(0);
  });
});
