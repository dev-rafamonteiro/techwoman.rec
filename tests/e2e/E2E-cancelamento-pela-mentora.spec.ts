import type { Page } from "@playwright/test";
import { expect, loginMentor, newPage, registerMentee, resetWorld, TEST_PASSWORD, test, type E2EWorld } from "./support.js";
import { userDoc } from "../helpers/seed.js";
import { testPasswordHash } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

/** RN25, RN27 · Desligado: M6 pede às administradoras com o motivo; o admin liga no A1; ligado, ela cancela e as administradoras são avisadas. */
let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
  const c = getCollections(world.db.db);
  await c.users.insertOne(userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: await testPasswordHash(), availability: [] }));
  // como em produção: evento sem o campo = desligado
  await c.events.updateMany({}, { $unset: { mentorCancelEnabled: "" } });
});
test.afterEach(async () => {
  await world.db.drop();
});

async function loginAdmin(page: Page) {
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill("admin@techwoman.test");
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/admin/);
}

test("desligado: a mentora pede o cancelamento com o motivo; ligado no A1, ela cancela", async ({ browser }, info) => {
  const viewport = info.project.use.viewport ?? undefined;
  const p = await newPage(browser, viewport);
  await registerMentee(p, { name: "Joana Teste", email: "joana@y.test", phone: "81999990001", area: "dados" });
  await p.context().close();

  const m = await newPage(browser, viewport);
  await loginMentor(m, world.mentorEmail(0));
  await m.goto("/mentora/agenda");
  await m.getByTestId("m6-cancel").click();
  const req = m.getByTestId("m6-request");
  await expect(req).toBeVisible();
  await expect(req).toContainText("só pode ser feito por uma das administradoras");
  await expect(m.getByTestId("m6-request-send")).toBeDisabled();
  await m.getByTestId("m6-request-reason").fill("Preciso sair mais cedo.");
  await m.screenshot({ path: info.outputPath("m6-pedido.png") });
  await m.getByTestId("m6-request-send").click();
  await expect(req).toBeHidden();
  const c = getCollections(world.db.db);
  await expect.poll(() => c.outbox.countDocuments({ type: "mentor_cancel_request" as never, to: "admin@techwoman.test" })).toBe(1);
  expect((await c.appointments.findOne({}))!.status).toBe("confirmed");

  const a = await newPage(browser, viewport);
  await loginAdmin(a);
  await a.goto("/admin");
  const toggle = a.getByTestId("a1-mentor-cancel");
  await expect(toggle).toContainText("desligado");
  await a.screenshot({ path: info.outputPath("a1-desligado.png") });
  await toggle.getByRole("switch").click();
  await expect(toggle).toContainText("ligado");
  await expect.poll(async () => (await c.events.findOne({}))!.mentorCancelEnabled).toBe(true);

  await m.reload();
  await m.getByTestId("m6-cancel").click();
  await m.getByTestId("m6-cancel-confirm").click();
  await expect.poll(async () => (await c.appointments.findOne({}))!.status).toBe("cancelled");
  // RN27: com o cancelamento ligado, as administradoras recebem o aviso e a auditoria leva a frase
  await expect.poll(() => c.outbox.countDocuments({ type: "mentor_cancelled" as never, to: "admin@techwoman.test" })).toBe(1);
  expect((await c.auditLogs.findOne({ action: "appointment.cancel" }))!.after).toMatchObject({ summary: expect.stringContaining("cancelou a mentoria") });
});
