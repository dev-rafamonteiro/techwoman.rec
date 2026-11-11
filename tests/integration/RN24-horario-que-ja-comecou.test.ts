import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** RN24 + RN04: na inscrição, horário que já começou (ou começa em menos de `minLeadMinutes`) some da lista e é recusado no envio. */
const api = await loadApi();

describe.skipIf(!api)("RN24 · horário que já começou não aparece na inscrição", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  let s01: { startAt: Date };
  let mentorId: string;

  beforeAll(async () => {
    b = await bootApi(api!, "passou", { mentors: 1, mentees: 0 });
    c = getCollections(b.t.db);
    await c.users.updateMany({ roles: "mentor" }, { $set: { areas: ["dados"] } });
    await c.events.updateMany({}, { $set: { minLeadMinutes: 10 } });
    s01 = (await c.events.findOne({}))!.slots.find((s) => s.id === "s01")!;
    mentorId = String((await c.users.findOne({ roles: "mentor" }))!._id);
  }, 120_000);
  afterAll(async () => b?.close());

  const ids = async () => ((await b.anon.get("/api/public/slots?area=dados")).body.items as { slotId: string }[]).map((i) => i.slotId);

  it("às 9:49 (11 min antes) o das 10h aparece; às 9:51 e às 10:05, não", async () => {
    b.clock.now = new Date(s01.startAt.getTime() - 11 * 60_000);
    expect(await ids()).toContain("s01");
    b.clock.now = new Date(s01.startAt.getTime() - 9 * 60_000);
    expect(await ids()).not.toContain("s01");
    b.clock.now = new Date(s01.startAt.getTime() + 5 * 60_000);
    expect(await ids()).not.toContain("s01");
  });

  it("às 10:05, enviar o horário das 10h (tela aberta antes) -> SLOT_UNAVAILABLE e ninguém é inscrito", async () => {
    b.clock.now = new Date(s01.startAt.getTime() + 5 * 60_000);
    const r = await b.anon.post("/api/public/mentees", {
      name: "Maria Silva", email: "passou@y.test", phone: "81945670001", area: "dados", slotId: "s01", mentorId,
      consent: { accepted: true, version: "2026-10-v1" }, turnstileToken: "test-ok",
    });
    expect(r.body.code, JSON.stringify(r.body)).toBe("SLOT_UNAVAILABLE");
    expect(await c.mentees.countDocuments({ emailNorm: "passou@y.test" })).toBe(0);
  });
});
