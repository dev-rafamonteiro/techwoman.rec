import { test } from "@playwright/test";
import { expect, newPage, resetWorld, type E2EWorld } from "./support.js";

/**
 * Regressão (ui-kit c3a5a27): o probe inicial de E12 (GET /auth/me) devolve 401 para visitante e NÃO é sessão
 * expirada. Rotas públicas ficam onde estão; rotas de staff vão para M1 com ?next=.
 */
let world: E2EWorld;
test.beforeAll(async () => {
  world = await resetWorld(1);
});
test.afterAll(async () => world?.db.drop());

const PUBLIC = ["/", "/jornada", "/jornada/resultado", "/mentoria/inscricao", "/mentoria/inscricao/ok", "/mentoria/minha?t=token-qualquer", "/entrar"];
const STAFF = ["/mentora/aguardando", "/mentora/agenda", "/mentora/disponibilidade", "/admin", "/admin/mentoras", "/admin/participantes", "/admin/mapa", "/admin/logs"];

for (const path of PUBLIC) {
  test(`visitante sem sessão fica em ${path}`, async ({ browser }, testInfo) => {
    const page = await newPage(browser, testInfo.project.use.viewport!);
    const me = page.waitForResponse((r) => r.url().includes("/api/auth/me"), { timeout: 10_000 }).catch(() => null);
    await page.goto(path);
    const res = await me; // o probe acontece e responde 401
    if (res) expect(res.status()).toBe(401);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // dá tempo de um redirect tardio acontecer
    const url = new URL(page.url());
    // P6 remove o ?t= da URL (token vai para o sessionStorage); o caminho em si não pode mudar
    expect(url.pathname).toBe(path.split("?")[0]);
  });
}

for (const path of STAFF) {
  test(`visitante sem sessão em ${path} vai para /entrar?next=`, async ({ browser }, testInfo) => {
    const page = await newPage(browser, testInfo.project.use.viewport!);
    await page.goto(path);
    await page.waitForURL(/\/entrar\?next=/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/entrar");
    expect(url.searchParams.get("next")).toBe(path);
    await expect(page.getByTestId("m1-form")).toBeVisible();
  });
}

test("depois do login volta para a rota pedida (next)", async ({ browser }, testInfo) => {
  const page = await newPage(browser, testInfo.project.use.viewport!);
  await page.goto("/mentora/agenda");
  await page.waitForURL(/\/entrar\?next=/);
  await page.getByTestId("m1-email").fill(world.mentorEmail(0));
  await page.getByTestId("m1-password").fill((await import("./support.js")).TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/mentora\/agenda/);
});

test("?next= externo é ignorado (sem open redirect)", async ({ browser }, testInfo) => {
  const page = await newPage(browser, testInfo.project.use.viewport!);
  await page.goto("/entrar?next=" + encodeURIComponent("https://evil.example/x"));
  await page.getByTestId("m1-email").fill(world.mentorEmail(0));
  await page.getByTestId("m1-password").fill((await import("./support.js")).TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/mentora\//);
  expect(new URL(page.url()).origin).toBe(new URL(testInfo.project.use.baseURL!).origin);
});
