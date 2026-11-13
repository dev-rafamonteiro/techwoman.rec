import { expect, loginMentor, newPage, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** RN26 · A mentora muda a disponibilidade em M3: as administradoras recebem o e-mail e a auditoria (A9) mostra o que mudou. */
let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
  const c = getCollections(world.db.db);
  await c.users.insertOne(userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: await testPasswordHash(), availability: [] }));
  await c.users.updateOne({ email: world.mentorEmail(0) }, { $set: { availability: [] } });
});
test.afterEach(async () => {
  await world.db.drop();
});

test("mentora inclui horários em M3; a administradora vê o resumo em Logs > Auditoria", async ({ browser }, info) => {
  const viewport = info.project.use.viewport ?? undefined;
  const m = await newPage(browser, viewport);
  await loginMentor(m, world.mentorEmail(0));
  await m.goto("/mentora/disponibilidade");
  await m.getByTestId("m3-morning").click();
  await m.getByTestId("m3-save").click();
  await expect(m.getByText("Tudo salvo")).toBeVisible();
  const c = getCollections(world.db.db);
  await expect.poll(() => c.outbox.countDocuments({ type: "mentor_availability_changed" as never, to: "admin@techwoman.test" })).toBe(1);

  const a = await newPage(browser, viewport);
  await a.goto("/entrar");
  await a.getByTestId("m1-email").fill("admin@techwoman.test");
  await a.getByTestId("m1-password").fill(TEST_PASSWORD);
  await a.getByTestId("m1-submit").click();
  await a.waitForURL(/\/admin/);
  await a.goto("/admin/logs");
  await a.getByRole("tab", { name: "Auditoria" }).click();
  await expect(a.getByText(/Incluiu .*9h00.* na disponibilidade de/).first()).toBeVisible();
  await a.screenshot({ path: info.outputPath("a9-auditoria.png") });
});
