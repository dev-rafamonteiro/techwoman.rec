import type { Page } from "@playwright/test";
import { expect, newPage, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** A2: copiar o e-mail da mentora e ver a senha redefinida na própria janela. */
const SHOT = process.env.E2E_SHOT_DIR;

let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
  await getCollections(world.db.db).users.insertOne(
    userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: await testPasswordHash(), availability: [] }),
  );
});
test.afterEach(async () => {
  await world.db.drop();
});

async function openMentors(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill("admin@techwoman.test");
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/mentoras");
  await expect(page.getByTestId("a2-copy-email").first()).toBeVisible();
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test("botão ao lado do e-mail copia o endereço da mentora", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await openMentors(page);
  await page.getByTestId("a2-copy-email").first().click();
  await expect.poll(() => clipboard(page)).toBe(world.mentorEmail(0));
  await expect(page.getByTestId("a2-copy-email").first()).toHaveAttribute("title", "Copiado");
  await page.context().close();
});

test("depois de redefinir, a janela mostra a senha oculta e o olho revela", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await openMentors(page);
  await page.getByRole("button", { name: "Redefinir senha" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Redefinir", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Senha redefinida" });
  await expect(dialog).toContainText(world.mentorEmail(0));
  const value = dialog.getByTestId("a2-secret-value");
  await expect(value).toHaveText(/^•+$/);
  if (SHOT) await page.screenshot({ path: `${SHOT}/a2-senha-${info.project.name}.png` });

  await dialog.getByTestId("a2-secret-eye").click();
  await expect(value).not.toHaveText(/•/);
  const password = await value.innerText();
  if (SHOT) await page.screenshot({ path: `${SHOT}/a2-senha-visivel-${info.project.name}.png` });
  await dialog.getByRole("button", { name: "Copiar senha" }).click();
  await expect.poll(() => clipboard(page)).toBe(password);
  await dialog.getByTestId("a2-secret-eye").click();
  await expect(value).toHaveText(/^•+$/);

  await dialog.getByRole("button", { name: "Fechar" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(password)).toHaveCount(0);
  await page.context().close();
});
