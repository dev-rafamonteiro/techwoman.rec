import type { Page } from "@playwright/test";
import { expect, newPage, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { menteeDoc, userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** A10 · RN28: sortear entre quem respondeu a pesquisa, ver as sorteadas e limpar a lista. */
const SHOT = process.env.E2E_SHOT_DIR;

let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
  const c = getCollections(world.db.db);
  await c.users.insertOne(userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: await testPasswordHash(), availability: [] }));
  // duas responderam a pesquisa
  const ms = [1, 2].map((i) => menteeDoc(i, { status: "done", phone: "+5581999990000" }).doc);
  await c.mentees.insertMany(ms);
  await c.feedbacks.insertMany(ms.map((m) => ({ _id: m._id, eventId: m.eventId, appointmentId: null, ratings: { event: 5, talk: 5, mentoring: 5 }, comment: null, createdAt: new Date() })));
});
test.afterEach(async () => {
  await world.db.drop();
});

async function openFeedback(page: Page) {
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill("admin@techwoman.test");
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/avaliacoes");
  await expect(page.getByTestId("a10-raffle-open")).toBeVisible();
}

test("sorteia sem repetir, lista as sorteadas e limpar devolve todas ao sorteio", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  const tag = info.project.name;
  await openFeedback(page);
  await page.getByTestId("a10-raffle-open").click();
  await expect(page.getByTestId("a10-raffle-eligible")).toHaveText("2 participantes concorrem");
  await page.getByTestId("a10-raffle-draw").click();
  const winner = page.getByTestId("a10-raffle-winner");
  await expect(winner).toContainText(/Participante \d/);
  await expect(page.getByTestId("a10-raffle-eligible")).toHaveText("1 participante concorre");
  if (SHOT) await page.screenshot({ path: `${SHOT}/a10-sorteio-${tag}.png` });
  const first = (await winner.locator(".a10-raffle__name").textContent())!;
  await page.getByTestId("a10-raffle-draw").click();
  await expect(winner.locator(".a10-raffle__name")).not.toHaveText(first);
  await expect(page.getByTestId("a10-raffle-draw")).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.getByTestId("a10-raffle-list").click();
  await expect(page.getByTestId("a10-raffle-draw-item")).toHaveCount(2);
  if (SHOT) await page.screenshot({ path: `${SHOT}/a10-sorteadas-${tag}.png` });
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("a10-raffle-clear").click();
  await expect(page.getByTestId("a10-raffle-draw-item")).toHaveCount(0);
  await page.context().close();
});
