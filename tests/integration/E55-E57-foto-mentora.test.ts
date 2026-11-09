import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi, type Client } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/** E55/E56 (carregar foto) e E57 (servir). A foto fica em `mentor_photos`; o photoUrl aponta para E57. */
const api = await loadApi();

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

function upload(c: Client, url: string, content: Buffer, type = "image/jpeg") {
  const boundary = "----tw-teste";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.jpg"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return c.req("POST", url, payload, { "content-type": `multipart/form-data; boundary=${boundary}` });
}

describe.skipIf(!api)("E55-E57 · foto da mentora", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const m = (i: number) => b.w.mentors[i]!;
  const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  const raw = (url: string) => b.app.inject({ method: "GET", url });

  beforeAll(async () => {
    b = await bootApi(api!, "e55", { mentors: 4, mentees: 1 });
    c = getCollections(b.t.db);
  }, 120_000);
  afterAll(async () => {
    if (b) await b.close();
  });

  it("E55: a mentora carrega, o photoUrl muda e a imagem sai pública com cache longo", async () => {
    const r = await upload(b.mentor[0]!, "/api/mentor/photo", JPEG);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.photoUrl).toMatch(new RegExp(`/api/public/mentors/${m(0)._id}/photo\\?v=[0-9a-f]{16}$`));
    expect((await c.users.findOne({ _id: m(0)._id }))?.photoUrl).toBe(r.body.photoUrl);

    const img = await raw(path(r.body.photoUrl));
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    expect(img.rawPayload.equals(JPEG)).toBe(true);

    const audit = await c.auditLogs.findOne({ action: "user.photo_upload", entityId: String(m(0)._id) });
    expect(audit).toBeTruthy();
  });

  it("E57 sem o `v` certo não ganha cache longo", async () => {
    const img = await raw(`/api/public/mentors/${m(0)._id}/photo?v=antigo`);
    expect(img.statusCode).toBe(200);
    expect(img.headers["cache-control"]).toBe("no-store");
  });

  it("trocar a foto muda o endereço e guarda só a última", async () => {
    const r1 = await upload(b.mentor[1]!, "/api/mentor/photo", JPEG);
    const outra = Buffer.concat([JPEG, Buffer.from([1])]);
    const r2 = await upload(b.mentor[1]!, "/api/mentor/photo", outra);
    expect(r2.body.photoUrl).not.toBe(r1.body.photoUrl);
    expect(await c.mentorPhotos.countDocuments({ _id: m(1)._id })).toBe(1);
    expect((await raw(path(r2.body.photoUrl))).rawPayload.equals(outra)).toBe(true);
  });

  it("E55 recusa o que não é JPEG, mesmo declarado como imagem", async () => {
    const r = await upload(b.mentor[2]!, "/api/mentor/photo", Buffer.from("<svg onload=alert(1)>"));
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("VALIDATION_ERROR");
    expect(await c.mentorPhotos.countDocuments({ _id: m(2)._id })).toBe(0);
  });

  it("E55 recusa arquivo acima do limite e requisição sem multipart", async () => {
    const r = await upload(b.mentor[2]!, "/api/mentor/photo", Buffer.concat([JPEG, Buffer.alloc(600 * 1024)]));
    expect(r.status).toBe(413);
    expect(r.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect((await b.mentor[2]!.post("/api/mentor/photo", {})).status).toBe(422);
  });

  it("exige login e o papel certo; E56 só para admin e só em mentora", async () => {
    expect((await upload(b.anon, "/api/mentor/photo", JPEG)).status).toBe(401);
    expect((await upload(b.admin, "/api/mentor/photo", JPEG)).status).toBe(403);
    expect((await upload(b.mentor[0]!, `/api/admin/mentors/${m(1)._id}/photo`, JPEG)).status).toBe(403);
    const staff = await c.users.findOne({ email: "admin@techwoman.test" });
    expect((await upload(b.admin, `/api/admin/mentors/${staff!._id}/photo`, JPEG)).status).toBe(404);
  });

  it("E56: o admin carrega e o E32 reenviando o mesmo endereço mantém a foto", async () => {
    const r = await upload(b.admin, `/api/admin/mentors/${m(2)._id}/photo`, JPEG);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const p = await b.admin.patch(`/api/admin/mentors/${m(2)._id}`, { photoUrl: r.body.photoUrl });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(await c.mentorPhotos.countDocuments({ _id: m(2)._id })).toBe(1);
  });

  it("foto carregada com a senha provisória ainda pendente (M2)", async () => {
    await c.users.updateOne({ _id: m(3)._id }, { $set: { mustChangePassword: true } });
    const r = await upload(b.mentor[3]!, "/api/mentor/photo", JPEG);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await c.users.updateOne({ _id: m(3)._id }, { $set: { mustChangePassword: false } });
  });

  it("E54 entrega o photoUrl carregado (https em produção)", async () => {
    await c.users.updateOne({ _id: m(3)._id }, { $set: { photoUrl: `https://techwoman.dev/api/public/mentors/${m(3)._id}/photo?v=abc` } });
    const r = await b.anon.get("/api/public/mentors");
    expect(r.body.items.find((x: any) => x.id === String(m(3)._id)).photoUrl).toContain("/photo?v=abc");
  });

  it("E57 não serve foto de mentora desativada nem id inválido", async () => {
    await c.users.updateOne({ _id: m(3)._id }, { $set: { status: "disabled" } });
    expect((await raw(`/api/public/mentors/${m(3)._id}/photo`)).statusCode).toBe(404);
    await c.users.updateOne({ _id: m(3)._id }, { $set: { status: "active" } });
    expect((await raw(`/api/public/mentors/nao-e-id/photo`)).statusCode).toBe(404);
  });

  it("E28 e E32 apagando a foto também apagam a imagem guardada", async () => {
    const p1 = await b.mentor[0]!.patch("/api/mentor/profile", { photoUrl: null });
    expect(p1.status, JSON.stringify(p1.body)).toBe(200);
    expect(await c.mentorPhotos.countDocuments({ _id: m(0)._id })).toBe(0);
    expect((await c.users.findOne({ _id: m(0)._id }))?.photoUrl).toBeNull();

    const p2 = await b.admin.patch(`/api/admin/mentors/${m(2)._id}`, { photoUrl: "https://techwoman.dev/mentoras/outra.jpg" });
    expect(p2.status, JSON.stringify(p2.body)).toBe(200);
    expect(await c.mentorPhotos.countDocuments({ _id: m(2)._id })).toBe(0);
  });
});
