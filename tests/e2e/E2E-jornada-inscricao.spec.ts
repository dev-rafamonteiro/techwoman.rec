import { expect, newPage, resetWorld, test, type E2EWorld } from "./support.js";
import { getCollections } from "../../src/db/collections.js";
import { KNOWLEDGE_TRACKS } from "../../src/shared/trilhas.js";

/** Da jornada à inscrição: o resultado vai preenchido na área e a API aceita. */
let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(1);
});
test.afterEach(async () => {
  await world.db.drop();
});

test("resultado da jornada preenche uma área válida e a inscrição conclui", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await page.goto("/jornada");
  await page.getByTestId("p2-start").click();
  for (let i = 0; ; i++) {
    expect(i).toBeLessThan(30);
    await page.getByTestId("p2-opt-0").click();
    const next = page.getByTestId("p2-next");
    const last = (await next.innerText()).includes("Ver meu resultado");
    await next.click();
    if (last) break;
  }
  await page.waitForURL(/\/jornada\/resultado/);
  const track = await page.getByTestId("p3-track").innerText();
  await page.getByTestId("p3-cta").click();
  await page.waitForURL(/\/mentoria\/inscricao/);

  const area = page.getByTestId("p4-area");
  await expect(area.locator("option:checked")).toHaveText(track);
  const theme = page.getByTestId("p4-theme");
  const firstTheme = await theme.locator("option").nth(1).innerText();
  await theme.selectOption(firstTheme);
  await page.getByTestId("p4-name").fill("Julia Jornada");
  await page.getByTestId("p4-email").fill("julia.jornada@example.test");
  await page.getByTestId("p4-phone").fill("81912345678");
  await page.getByText(/manhã/i).first().click();
  await page.getByTestId("p4-consent").check();
  await page.getByTestId("p4-submit").click();
  await page.waitForURL(/\/mentoria\/inscricao\/ok/);

  const mentee = await getCollections(world.db.db).mentees.findOne({ emailNorm: "julia.jornada@example.test" });
  expect(KNOWLEDGE_TRACKS.find(({ key }) => key === mentee?.area)?.label).toBe(track);
  expect(Object.keys(mentee?.quizScores ?? {})).toContain(mentee?.area);
  expect(mentee?.theme).toBe(firstTheme);
  await page.context().close();
});

test("trocar a trilha limpa o tema e mostra só os temas dela", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await page.goto("/mentoria/inscricao");
  await expect(page.getByText("Trilha de interesse")).toBeVisible();
  await page.getByTestId("p4-area").selectOption("dados");
  await page.getByTestId("p4-theme").selectOption("Engenharia de Dados");
  await page.getByTestId("p4-area").selectOption("qualidade");
  await expect(page.getByTestId("p4-theme")).toHaveValue("");
  await expect(page.getByTestId("p4-theme").locator("option")).toHaveText(["Selecione um tema", "Qualidade de Engenharia de Software", "Quality Assurance"]);
  await page.context().close();
});

test("área antiga guardada no navegador não trava a inscrição", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await page.addInitScript(() => sessionStorage.setItem("tw:journey", JSON.stringify({ area: "backend", scores: { backend: 3 } })));
  await page.goto("/mentoria/inscricao");
  await page.getByTestId("p4-name").fill("Clara Antiga");
  await page.getByTestId("p4-email").fill("clara.antiga@example.test");
  await page.getByTestId("p4-phone").fill("81912345678");
  await page.getByText(/manhã/i).first().click();
  await page.getByTestId("p4-consent").check();
  await page.getByTestId("p4-submit").click();
  await page.waitForURL(/\/mentoria\/inscricao\/ok/);
  await page.context().close();
});

test("celular sem o 9 é apontado no formulário", async ({ browser }, info) => {
  const page = await newPage(browser, info.project.use.viewport ?? undefined);
  await page.goto("/mentoria/inscricao");
  await page.getByTestId("p4-phone").fill("81812345678");
  await page.getByTestId("p4-phone").blur();
  await expect(page.getByText(/celular com 9 na frente/)).toBeVisible();
  await page.context().close();
});
