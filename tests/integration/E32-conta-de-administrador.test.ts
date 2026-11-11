import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { userDoc } from "../helpers/seed.js";
import { getCollections } from "../../src/db/collections.js";

/** E32: conta de administrador que também é mentora só o super admin altera (status, dados), como no E34. */
const api = await loadApi();

describe.skipIf(!api)("E32 · admin não altera conta de administrador", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const superMentor = userDoc(60, { name: "Super Mentora", roles: ["mentor", "super_admin"], availability: [] });
  const adminMentor = userDoc(61, { name: "Admin Mentora", roles: ["mentor", "admin"], availability: [] });

  beforeAll(async () => {
    b = await bootApi(api!, "e32staff", { mentors: 1, mentees: 0 });
    c = getCollections(b.t.db);
    await c.users.insertMany([superMentor, adminMentor]);
  }, 120_000);
  afterAll(async () => b?.close());

  it("admin desativando ou editando super admin/admin que é mentora -> 403, e nada muda", async () => {
    for (const target of [superMentor, adminMentor]) {
      const off = await b.admin.patch(`/api/admin/mentors/${target._id}`, { status: "disabled" });
      expect([off.status, off.body.code]).toEqual([403, "FORBIDDEN"]);
      const edit = await b.admin.patch(`/api/admin/mentors/${target._id}`, { name: "Outro Nome" });
      expect(edit.status).toBe(403);
      expect(await c.users.findOne({ _id: target._id })).toMatchObject({ status: "active", name: target.name });
    }
  });

  it("super admin altera; mentora comum o admin continua editando", async () => {
    const r = await b.superAdmin.patch(`/api/admin/mentors/${adminMentor._id}`, { name: "Admin Mentora 2" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const plain = await b.admin.patch(`/api/admin/mentors/${b.w.mentors[0]!._id}`, { name: "Mentora Editada" });
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
  });
});
