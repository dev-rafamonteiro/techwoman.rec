import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTestDb, type TestDb } from "../helpers/db.js";
import { appointmentDoc, seedWorld, type World } from "../helpers/seed.js";
import { INDEX_NAMES, createIndexes, mapDuplicateKeyError } from "../../src/db/indexes.js";
import { getCollections } from "../../src/db/collections.js";

describe("índices únicos parciais de appointments (PLAN: Modelo de dados; Concorrência)", () => {
  let t: TestDb;
  let w: World;
  beforeAll(async () => {
    t = await createTestDb("indices");
    w = await seedWorld(t.db, { mentors: 3, tables: 3, mentees: 4 });
  });
  afterAll(async () => t?.drop());

  const ids = () => ({
    m: w.mentors.map((x) => x._id),
    t: w.tables.map((x) => x._id),
    p: w.mentees.map((x) => x.doc._id),
  });

  it("createIndexes é idempotente e cria os três índices de agenda com os nomes combinados", async () => {
    await createIndexes(t.db);
    await createIndexes(t.db);
    const idx = await t.db.collection("appointments").indexes();
    for (const name of Object.values(INDEX_NAMES)) {
      const i = idx.find((x) => x.name === name);
      expect(i?.unique, name).toBe(true);
      expect(i?.partialFilterExpression, name).toBeTruthy();
    }
  });

  it("E24/RN04: mesma mesa no mesmo horário -> TABLE_TAKEN (slotLock)", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    await appointments.insertOne(appointmentDoc({ menteeId: p[0]!, mentorId: m[0]!, tableId: tb[0]!, slotId: "s01" }));
    const err = await appointments.insertOne(appointmentDoc({ menteeId: p[1]!, mentorId: m[1]!, tableId: tb[0]!, slotId: "s01" })).catch((e) => e);
    expect(mapDuplicateKeyError(err)).toBe("TABLE_TAKEN");
  });

  it("E24/RN04: mesma mentora no mesmo horário -> MENTOR_BUSY", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    const err = await appointments.insertOne(appointmentDoc({ menteeId: p[1]!, mentorId: m[0]!, tableId: tb[1]!, slotId: "s01" })).catch((e) => e);
    expect(mapDuplicateKeyError(err)).toBe("MENTOR_BUSY");
  });

  it("E24/RN04: mesma participante com mentoria ativa -> MENTEE_TAKEN", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    const err = await appointments.insertOne(appointmentDoc({ menteeId: p[0]!, mentorId: m[2]!, tableId: tb[2]!, slotId: "s05" })).catch((e) => e);
    expect(mapDuplicateKeyError(err)).toBe("MENTEE_TAKEN");
  });

  it("horário/mesa/mentora diferentes não colidem", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    await expect(appointments.insertOne(appointmentDoc({ menteeId: p[1]!, mentorId: m[1]!, tableId: tb[1]!, slotId: "s02" }))).resolves.toBeTruthy();
  });

  it("liberar mesa/horário é remover slotLock: o mesmo horário volta a poder ser usado (RN10)", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    const first = await appointments.findOne({ tableId: tb[0]!, slotId: "s01" });
    await appointments.updateOne({ _id: first!._id }, { $set: { status: "cancelled" }, $unset: { slotLock: "", menteeLock: "" } });
    await expect(appointments.insertOne(appointmentDoc({ menteeId: p[0]!, mentorId: m[0]!, tableId: tb[0]!, slotId: "s01" }))).resolves.toBeTruthy();
  });

  it("done/no_show mantêm slotLock (mesa/mentora seguem ocupadas) mas liberam a participante", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    const a = appointmentDoc({ menteeId: p[2]!, mentorId: m[2]!, tableId: tb[2]!, slotId: "s09", status: "done" });
    delete a.menteeLock;
    await appointments.insertOne(a);
    // participante livre: pode ter outra mentoria
    await expect(appointments.insertOne(appointmentDoc({ menteeId: p[2]!, mentorId: m[1]!, tableId: tb[1]!, slotId: "s10" }))).resolves.toBeTruthy();
    // mesa segue ocupada
    const err = await appointments.insertOne(appointmentDoc({ menteeId: p[3]!, mentorId: m[0]!, tableId: tb[2]!, slotId: "s09" })).catch((e) => e);
    expect(mapDuplicateKeyError(err)).toBe("TABLE_TAKEN");
  });

  it("validador $jsonSchema strict rejeita campo extra e status inválido", async () => {
    const { appointments } = getCollections(t.db);
    const { m, t: tb, p } = ids();
    const base = appointmentDoc({ menteeId: p[3]!, mentorId: m[2]!, tableId: tb[0]!, slotId: "s11" });
    await expect(appointments.insertOne({ ...base, hack: 1 } as never)).rejects.toMatchObject({ code: 121 });
    await expect(appointments.insertOne({ ...base, _id: new ObjectId(), status: "bogus" } as never)).rejects.toMatchObject({ code: 121 });
  });

  it("mentees: e-mail único por evento, tokenHash único (RN01)", async () => {
    const { mentees } = getCollections(t.db);
    const dup = { ...w.mentees[0]!.doc, _id: new ObjectId(), tokenHash: "outro" };
    await expect(mentees.insertOne(dup)).rejects.toMatchObject({ code: 11000 });
    const dup2 = { ...w.mentees[0]!.doc, _id: new ObjectId(), emailNorm: "novo@exemplo.test", email: "novo@exemplo.test" };
    await expect(mentees.insertOne(dup2)).rejects.toMatchObject({ code: 11000 });
  });

  it("outbox: dedupeKey único; sessions e idempotency_keys têm TTL", async () => {
    const idx = async (c: string) => t.db.collection(c).indexes();
    expect((await idx("outbox")).find((i) => i.name === "outbox_dedupe")?.unique).toBe(true);
    expect((await idx("sessions")).find((i) => i.name === "session_ttl")?.expireAfterSeconds).toBe(0);
    expect((await idx("idempotency_keys")).find((i) => i.name === "idem_ttl")?.expireAfterSeconds).toBe(600);
  });
});
