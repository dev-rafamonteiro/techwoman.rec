import type { Page } from "@playwright/test";
import { expect, loginMentor, newPage, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** Carregar foto em M2, M3 e A3, com a mesma regra de imagens do site em produção (ops/web-entrypoint.sh). */
const SHOT = process.env.E2E_SHOT_DIR;

async function withProductionImagePolicy(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": "img-src 'self' data:" } });
  });
}

/** PNG de 1600x1200 gerado no próprio navegador. */
async function bigPng(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1200;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7b2d8b";
    g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#b7f0d8";
    g.fillRect(500, 200, 600, 800);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  return { name: "foto.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

const loaded = (page: Page, testId: string) =>
  expect.poll(() => page.getByTestId(testId).locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => 0));

let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(2);
});
test.afterEach(async () => {
  await world.db.drop();
});

test("mentora carrega, troca e remove a foto em M3; M4 deixa de avisar", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await withProductionImagePolicy(page);
  const photos = getCollections(world.db.db).mentorPhotos;
  await loginMentor(page, world.mentorEmail(0));
  await page.goto("/mentora/aguardando");
  await expect(page.getByTestId("m4-no-photo")).toBeVisible();
  await page.getByTestId("m4-no-photo").getByRole("link").click();
  await expect(page.getByTestId("m3-photo")).toBeVisible();

  await page.getByTestId("mentor-photo-input").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("isto não é imagem") });
  await expect(page.getByTestId("mentor-photo").getByRole("alert")).toContainText("Não foi possível abrir");
  expect(await photos.countDocuments({})).toBe(0);

  await page.getByTestId("mentor-photo-input").setInputFiles(await bigPng(page));
  await loaded(page, "mentor-photo").toBe(640);
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
  const doc = await photos.findOne({});
  expect(doc?.data.buffer.length).toBeLessThan(512 * 1024);
  if (SHOT) await page.screenshot({ path: `${SHOT}/m3-${info.project.name}.png` });

  await page.goto("/mentora/aguardando");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByTestId("m4-no-photo")).toHaveCount(0);

  await page.goto("/mentora/disponibilidade");
  await page.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByRole("button", { name: "Carregar foto" })).toBeVisible();
  expect(await photos.countDocuments({})).toBe(0);
});

test("primeiro acesso (M2): carrega a foto antes de trocar a senha", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await withProductionImagePolicy(page);
  await getCollections(world.db.db).users.updateOne({ email: world.mentorEmail(0) }, { $set: { mustChangePassword: true } });
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill(world.mentorEmail(0));
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/entrar\/nova-senha/);
  await page.getByTestId("mentor-photo-input").setInputFiles(await bigPng(page));
  await loaded(page, "mentor-photo").toBe(640);
  await expect(page).toHaveURL(/\/entrar\/nova-senha/);
  if (SHOT) await page.screenshot({ path: `${SHOT}/m2-${info.project.name}.png`, fullPage: true });
});

test("admin carrega a foto da mentora em A3 e o salvar mantém", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await withProductionImagePolicy(page);
  const c = getCollections(world.db.db);
  await c.users.insertOne(userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: await testPasswordHash(), availability: [] }));
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill("admin@techwoman.test");
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/admin/);
  await page.goto(`/admin/mentoras/${world.w.mentors[1]!._id}`);
  await page.getByTestId("a3-photo-input").setInputFiles(await bigPng(page));
  await loaded(page, "a3-photo").toBe(640);
  if (SHOT) await page.getByTestId("a3-photo").scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${SHOT}/a3-${info.project.name}.png` }));
  await page.getByRole("button", { name: /salvar/i }).click();
  await page.waitForURL(/\/admin\/mentoras$/);
  expect(await c.mentorPhotos.countDocuments({ _id: world.w.mentors[1]!._id })).toBe(1);
  expect((await c.users.findOne({ _id: world.w.mentors[1]!._id }))?.photoUrl).toContain("/photo?v=");
});

test("P7: mentora sem foto aparece com a imagem padrão", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await withProductionImagePolicy(page);
  await page.goto("/mentoras");
  const img = page.getByTestId("p7-card").first().locator("img");
  await img.scrollIntoViewIfNeeded();
  await expect(img).toHaveAttribute("src", "/mentoras/sem-foto.png");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(188);
  if (SHOT) await page.screenshot({ path: `${SHOT}/p7-${info.project.name}.png` });
});
