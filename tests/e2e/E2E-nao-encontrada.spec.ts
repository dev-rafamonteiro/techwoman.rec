import { expect, newPage, resetWorld, test, type E2EWorld } from "./support.js";

/** Endereço inexistente: página própria com contagem regressiva e volta ao início sozinha em 5 s. */
let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
});
test.afterEach(async () => {
  await world?.db.drop();
});

test("endereço inexistente mostra a página e volta para a home em 5 s", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await page.goto("/pagina-que-nao-existe");
  await expect(page.getByTestId("not-found")).toBeVisible();
  await expect(page.getByTestId("not-found-countdown")).toContainText("5 segundos");
  await page.screenshot({ path: info.outputPath("nao-encontrada.png") });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 8000 });
  await page.context().close();
});

test("no toten, volta para o início do toten", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "toten é tela grande");
  const page = await newPage(browser, { width: 1920, height: 1080 });
  await page.goto("/jornada_toten/nada-aqui");
  await expect(page.getByTestId("not-found")).toBeVisible();
  await page.getByTestId("not-found-home").click();
  await expect(page).toHaveURL(/\/jornada_toten$/);
  await page.context().close();
});
