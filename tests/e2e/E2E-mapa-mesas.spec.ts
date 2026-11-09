import type { Page } from "@playwright/test";
import { expect, newPage, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { appointmentDoc, menteeDoc, userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** A5: a célula mostra os dois nomes; o clique abre a janela com as informações e as ações. */
const SHOT = process.env.E2E_SHOT_DIR;

let world: E2EWorld;
let cellId: string;

test.beforeEach(async () => {
  world = await resetWorld(1);
  const c = getCollections(world.db.db);
  const hash = await testPasswordHash();
  await c.users.insertMany([
    userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: hash, availability: [] }),
    userDoc(901, { name: "Super", email: "super@techwoman.test", roles: ["super_admin"], passwordHash: hash, availability: [] }),
  ]);
  const { doc } = menteeDoc(1, { name: "Bruna Teste", status: "done" });
  await c.mentees.insertOne(doc);
  const table = world.w.tables[0]!;
  const slotId = world.w.slotIds[0]!;
  await c.appointments.insertOne(appointmentDoc({ menteeId: doc._id, mentorId: world.w.mentors[0]!._id, tableId: table._id, slotId, status: "done", slotLock: true }));
  await c.appointments.updateOne({ menteeId: doc._id }, { $unset: { menteeLock: "" } });
  cellId = `cell-${slotId}-${table._id}`;
});
test.afterEach(async () => {
  await world.db.drop();
});

async function openMap(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill(email);
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/mapa");
  await page.getByRole("radio", { name: "Dia inteiro" }).click();
}

test("super admin vê os nomes, abre a janela e libera a mesa", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  page.on("dialog", (d) => void d.accept());
  await openMap(page, "super@techwoman.test");
  const cell = page.getByTestId(cellId);
  await expect(cell).toContainText(world.w.mentors[0]!.name);
  await expect(cell).toContainText("Bruna Teste");
  if (SHOT) await page.screenshot({ path: `${SHOT}/a5-grade-${info.project.name}.png` });

  await cell.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Bruna Teste");
  await expect(dialog).toContainText("Concluída");
  await expect(dialog.getByTestId("a5-reopen")).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/a5-janela-${info.project.name}.png` });

  await dialog.getByTestId("a5-release").click();
  await expect(dialog).toHaveCount(0);
  await expect(cell).toContainText("Livre");
  const c = getCollections(world.db.db);
  expect((await c.appointments.findOne({}))?.status).toBe("cancelled");
  expect((await c.mentees.findOne({}))?.status).toBe("waiting");
});

test("admin abre a janela, mas sem as correções de super admin", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await openMap(page, "admin@techwoman.test");
  await page.getByTestId(cellId).getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("Bruna Teste");
  await expect(page.getByTestId("a5-reopen")).toHaveCount(0);
  await expect(page.getByTestId("a5-release")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
