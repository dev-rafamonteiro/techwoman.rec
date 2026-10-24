import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChangeStreamDocument } from "mongodb";
import { createTestDb, type TestDb } from "../helpers/db.js";

describe("00 mongo-local: replica set, transações e Change Streams", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb("mongolocal");
  });
  afterAll(async () => {
    await t?.drop();
  });

  it("é replica set com primário (rs.status ok)", async () => {
    const admin = t.client.db("admin");
    const status = await admin.command({ replSetGetStatus: 1 });
    expect(status.ok).toBe(1);
    expect(status.members.some((m: { stateStr: string }) => m.stateStr === "PRIMARY")).toBe(true);
    const hello = await admin.command({ hello: 1 });
    expect(hello.isWritablePrimary).toBe(true);
    expect(hello.setName).toBeTruthy();
  });

  it("transação confirma com snapshot + majority", async () => {
    const col = t.db.collection("tx");
    const s = t.client.startSession();
    try {
      await s.withTransaction(
        async () => {
          await col.insertOne({ k: "commit" }, { session: s });
        },
        { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
      );
    } finally {
      await s.endSession();
    }
    expect(await col.countDocuments({ k: "commit" })).toBe(1);
  });

  it("transação desfaz tudo quando um insert viola índice único parcial", async () => {
    const col = t.db.collection("tx_rollback");
    await col.createIndex({ a: 1 }, { unique: true, partialFilterExpression: { lock: true } });
    await col.insertOne({ a: 1, lock: true });
    const s = t.client.startSession();
    await expect(
      s.withTransaction(async () => {
        await col.insertOne({ a: 99 }, { session: s });
        await col.insertOne({ a: 1, lock: true }, { session: s });
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await s.endSession();
    expect(await col.countDocuments({ a: 99 })).toBe(0);
    // sem lock não colide (índice parcial)
    await col.insertOne({ a: 1 });
    expect(await col.countDocuments({ a: 1 })).toBe(2);
  });

  it("Change Stream com fullDocument updateLookup entrega insert e update", async () => {
    const col = t.db.collection("cs");
    const stream = col.watch([], { fullDocument: "updateLookup" });
    const events: ChangeStreamDocument[] = [];
    stream.on("change", (c) => events.push(c));
    // aguarda o cursor abrir
    await new Promise((r) => setTimeout(r, 500));
    const { insertedId } = await col.insertOne({ status: "waiting" });
    await col.updateOne({ _id: insertedId }, { $set: { status: "invited" } });
    const deadline = Date.now() + 10_000;
    while (events.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    await stream.close();
    expect(events.map((e) => e.operationType)).toEqual(["insert", "update"]);
    const upd = events[1] as ChangeStreamDocument & { fullDocument?: { status: string } };
    expect(upd.fullDocument?.status).toBe("invited");
    expect(events[1]?._id).toBeTruthy(); // resume token
  });
});
