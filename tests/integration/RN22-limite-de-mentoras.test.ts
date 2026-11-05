import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { formatTimeBR } from "@tw/shared";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { EVENT_ID } from "../helpers/seed.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * RN22 · Limite de mentoras por horário (E20, E21, E30, E32): capacidade = mesas ativas; contagem = mentoras ativas
 * com o horário na disponibilidade. Só horário ADICIONADO por E21 esbarra no limite; o admin passa do limite com aviso.
 * A corrida (várias mentoras salvando o mesmo horário com uma vaga) é serializada pela trava `slot_counters`.
 */
const api = await loadApi();

describe.skipIf(!api)("RN22 · limite de mentoras por horário", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const mentorId = (i: number) => b.w.mentors[i]!._id;
  const setAv = (i: number, availability: string[]) => c.users.updateOne({ _id: mentorId(i) }, { $set: { availability } });
  const avOf = async (i: number) => (await c.users.findOne({ _id: mentorId(i) }))!.availability;
  const label = async (slotId: string) => {
    const ev = (await c.events.findOne({ _id: EVENT_ID }))!;
    return formatTimeBR(ev.slots.find((s) => s.id === slotId)!.startAt, ev.timezone);
  };

  beforeAll(async () => {
    // 3 mesas ativas + 1 inativa (não conta); 6 mentoras, todas começam sem horário
    b = await bootApi(api!, "rn22", { mentors: 6, mentees: 1, tables: 3 });
    c = getCollections(b.t.db);
    await c.tables.insertOne({ _id: new ObjectId(), eventId: EVENT_ID, number: 99, name: null, location: null, active: false });
    await c.users.updateMany({ roles: "mentor" }, { $set: { availability: [] } });
  }, 120_000);
  afterAll(async () => {
    if (b) await b.close();
  });

  it("E21: horário lotado é recusado com 409 SLOT_FULL e a mensagem no fuso do evento; nada é gravado", async () => {
    for (const i of [1, 2, 3]) await setAv(i, ["s03"]);
    const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: ["s01", "s03"] });
    expect([r.status, r.body.code]).toEqual([409, "SLOT_FULL"]);
    expect(r.body.message).toBe(`O horário ${await label("s03")} já está lotado (3 de 3 mesas).`);
    expect(r.body.details.slots).toEqual([expect.objectContaining({ slotId: "s03", mentorsAvailable: 3, capacity: 3 })]);
    expect(await avOf(0)).toEqual([]);
  });

  it("E21: vários horários lotados aparecem todos na mensagem", async () => {
    for (const i of [1, 2, 3]) await setAv(i, ["s03", "s04"]);
    const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: ["s03", "s04", "s05"] });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe(`Os horários ${await label("s03")} (3 de 3 mesas) e ${await label("s04")} (3 de 3 mesas) já estão lotados.`);
    for (const i of [1, 2, 3]) await setAv(i, ["s03"]);
  });

  it("mesa inativa não conta na capacidade: ativar a 4ª mesa abre uma vaga", async () => {
    const extra = await c.tables.findOne({ number: 99 });
    await c.tables.updateOne({ _id: extra!._id }, { $set: { active: true } });
    try {
      const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: ["s03"] });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      await b.mentor[0]!.put("/api/mentor/availability", { slotIds: [] });
    } finally {
      await c.tables.updateOne({ _id: extra!._id }, { $set: { active: false } });
    }
  });

  it("mentora desativada não conta", async () => {
    await c.users.updateOne({ _id: mentorId(3) }, { $set: { status: "disabled" } });
    try {
      const r = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: ["s03"] });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await avOf(0)).toEqual(["s03"]);
    } finally {
      await c.users.updateOne({ _id: mentorId(3) }, { $set: { status: "active" } });
    }
  });

  it("dado antigo acima do limite é mantido; remover é sempre permitido; remarcar depois é recusado", async () => {
    for (const i of [0, 1, 2, 3, 4, 5]) await setAv(i, ["s05"]); // 6 mentoras para 3 mesas
    const keep = await b.mentor[0]!.put("/api/mentor/availability", { slotIds: ["s05"] });
    expect(keep.status, JSON.stringify(keep.body)).toBe(200);
    const removeOne = await b.mentor[1]!.put("/api/mentor/availability", { slotIds: [] });
    expect(removeOne.status).toBe(200);
    expect(await avOf(1)).toEqual([]);
    // ainda 5 para 3: quem saiu não volta
    const back = await b.mentor[1]!.put("/api/mentor/availability", { slotIds: ["s05"] });
    expect([back.status, back.body.code]).toEqual([409, "SLOT_FULL"]);
    expect(back.body.details.slots[0]).toMatchObject({ slotId: "s05", mentorsAvailable: 5, capacity: 3 });
    // a mensagem não passa do total de mesas ("5 de 3" leria estranho)
    expect(back.body.message).toBe(`O horário ${await label("s05")} já está lotado (3 de 3 mesas).`);
  });

  it("E20: mentorsAvailable, capacity e full por horário (ela inclusa na contagem)", async () => {
    const mine = await b.mentor[0]!.get("/api/mentor/availability");
    expect(mine.status).toBe(200);
    const s05 = mine.body.slots.find((s: any) => s.slot.id === "s05");
    expect(s05).toMatchObject({ available: true, mentorsAvailable: 5, capacity: 3, full: true });
    const other = await b.mentor[1]!.get("/api/mentor/availability");
    expect(other.body.slots.find((s: any) => s.slot.id === "s05")).toMatchObject({ available: false, full: true });
    expect(other.body.slots.find((s: any) => s.slot.id === "s01")).toMatchObject({ available: false, mentorsAvailable: 0, capacity: 3, full: false });
  });

  it("E32: o admin passa do limite e recebe o aviso; sem excesso, aviso vazio", async () => {
    const r = await b.admin.req("PATCH", `/api/admin/mentors/${mentorId(1)}`, { availability: ["s05", "s01"] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.user.availability).toEqual(["s01", "s05"]);
    expect(r.body.warnings.overCapacity).toEqual([expect.objectContaining({ slotId: "s05", mentorsAvailable: 6, capacity: 3 })]);
    const ok = await b.admin.req("PATCH", `/api/admin/mentors/${mentorId(1)}`, { availability: ["s01"] });
    expect(ok.body.warnings).toEqual({ overCapacity: [] });
    const nameOnly = await b.admin.req("PATCH", `/api/admin/mentors/${mentorId(0)}`, { name: "Mentora Zero" });
    expect(nameOnly.body.warnings.overCapacity.map((s: any) => s.slotId)).toEqual(["s05"]);
  });

  it("E30: horários futuros acima do limite no dashboard", async () => {
    const r = await b.admin.get("/api/admin/dashboard");
    expect(r.status).toBe(200);
    expect(r.body.overCapacitySlots).toEqual([expect.objectContaining({ slotId: "s05", mentorsAvailable: 5, capacity: 3 })]);
  });
});

describe.skipIf(!api)("RN22 · corrida: várias mentoras salvando o mesmo horário ao mesmo tempo", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  beforeAll(async () => {
    b = await bootApi(api!, "rn22race", { mentors: 12, mentees: 1, tables: 2 });
    c = getCollections(b.t.db);
    await c.users.updateMany({ roles: "mentor" }, { $set: { availability: [] } });
  }, 120_000);
  afterAll(async () => {
    if (b) await b.close();
  });

  it("capacidade 2 com 1 ocupada, 5 mentoras marcam juntas: exatamente 1 consegue, 4 recebem SLOT_FULL (10 rodadas)", async () => {
    const times: number[] = [];
    for (let round = 0; round < 10; round++) {
      const slot = `s${String(round + 1).padStart(2, "0")}`;
      await c.users.updateOne({ _id: b.w.mentors[0]!._id }, { $set: { availability: [slot] } });
      const racers = [1, 2, 3, 4, 5].map((i) => b.mentor[i]!);
      const t0 = performance.now();
      const res = await Promise.all(racers.map((m) => m.put("/api/mentor/availability", { slotIds: [slot] })));
      times.push(performance.now() - t0);
      const statuses = res.map((r) => r.status).sort();
      expect(statuses, JSON.stringify(res.filter((r) => r.status !== 200 && r.status !== 409).map((r) => r.body))).toEqual([200, 409, 409, 409, 409]);
      expect(res.filter((r) => r.status === 409).every((r) => r.body.code === "SLOT_FULL")).toBe(true);
      expect(await c.users.countDocuments({ roles: "mentor", availability: slot })).toBe(2);
      // limpa para a próxima rodada
      await c.users.updateMany({ roles: "mentor" }, { $set: { availability: [] } });
    }
    console.log(`[RN22] 5 E21 simultâneos por rodada: média ${Math.round(times.reduce((s, x) => s + x, 0) / times.length)} ms, máx ${Math.round(Math.max(...times))} ms`);
  });

  it("capacidade 2, 12 mentoras marcam juntas o mesmo horário vazio: exatamente 2 conseguem, sem 5xx", async () => {
    const t0 = performance.now();
    const res = await Promise.all(b.mentor.map((m) => m.put("/api/mentor/availability", { slotIds: ["s12", "s11"] })));
    const ms = performance.now() - t0;
    expect(res.filter((r) => r.status >= 500)).toHaveLength(0);
    expect(res.filter((r) => r.status === 200)).toHaveLength(2);
    expect(res.filter((r) => r.status === 409 && r.body.code === "SLOT_FULL")).toHaveLength(10);
    expect(await c.users.countDocuments({ roles: "mentor", availability: "s12" })).toBe(2);
    expect(await c.users.countDocuments({ roles: "mentor", availability: "s11" })).toBe(2);
    console.log(`[RN22] 12 E21 simultâneos (2 horários, 2 mesas): ${Math.round(ms)} ms`);
  });
});
