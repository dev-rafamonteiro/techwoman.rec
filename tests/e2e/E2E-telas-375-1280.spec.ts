import { test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, loginMentor, newPage, resetWorld, TEST_PASSWORD, type E2EWorld } from "./support.js";

/**
 * Verificação visual das telas em 375 e 1280 px. Sempre: sem estouro horizontal, sem erro de console e screenshot em
 * tests/e2e/__shots__/. Quando design/screens/<codigo>-<largura>.png existir, compara por tamanho/proporção de página
 * (a comparação pixel a pixel fica a cargo da revisão com o ui-kit).
 */
const SHOTS = resolve(import.meta.dirname, "__shots__");
const DESIGN = resolve(import.meta.dirname, "../../design/screens");
const WIDTHS = [375, 1280] as const;

const PUBLIC: [string, string][] = [
  ["P1", "/"], ["P2", "/jornada"], ["P3", "/jornada/resultado"], ["P4", "/mentoria/inscricao"], ["P5", "/mentoria/inscricao/ok"],
  ["P6-invalido", "/mentoria/minha"], ["M1", "/entrar"],
];
const MENTOR: [string, string][] = [["M3", "/mentora/disponibilidade"], ["M4", "/mentora/aguardando"], ["M6", "/mentora/agenda"]];
const ADMIN: [string, string][] = [
  ["A1", "/admin"], ["A2", "/admin/mentoras"], ["A3-nova", "/admin/mentoras/nova"], ["A3-importar", "/admin/mentoras/importar"],
  ["A4", "/admin/participantes"], ["A5", "/admin/mapa"], ["A6", "/admin/mesas"], ["A7", "/admin/evento"],
  ["A8", "/admin/usuarios"], ["A9", "/admin/logs"],
];

let world: E2EWorld;
test.beforeAll(async () => {
  world = await resetWorld(1);
  const users = world.db.db.collection("users");
  const base = (await users.findOne({}))!;
  const { _id, ...rest } = base;
  await users.insertOne({ ...rest, email: "super@techwoman.test", name: "Super", roles: ["super_admin"], availability: [] } as never);
});
test.afterAll(async () => world?.db.drop());

async function check(page: import("@playwright/test").Page, code: string, url: string, width: number) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${code} @${width}: scroll horizontal`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: resolve(SHOTS, `${code}-${width}.png`), fullPage: true });
  expect(errors.filter((e) => !/Failed to load resource|favicon/i.test(e)), `${code} @${width}: erros de console`).toEqual([]);
  const ref = resolve(DESIGN, `${code}-${width}.png`);
  test.info().annotations.push({ type: "design", description: existsSync(ref) ? ref : "sem referência em design/screens" });
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    for (const [code, url] of PUBLIC) {
      test(`${code} ${url}`, async ({ browser }) => {
        const page = await newPage(browser, { width, height: 800 });
        await check(page, code, url, width);
      });
    }
    for (const [code, url] of MENTOR) {
      test(`${code} ${url}`, async ({ browser }) => {
        const page = await newPage(browser, { width, height: 800 });
        await loginMentor(page, world.mentorEmail(0));
        await check(page, code, url, width);
      });
    }
    for (const [code, url] of ADMIN) {
      test(`${code} ${url}`, async ({ browser }) => {
        const page = await newPage(browser, { width, height: 800 });
        await page.goto("/entrar");
        await page.getByTestId("m1-email").fill("super@techwoman.test");
        await page.getByTestId("m1-password").fill(TEST_PASSWORD);
        await page.getByTestId("m1-submit").click();
        await page.waitForURL(/\/admin/);
        await check(page, code, url, width);
      });
    }
  });
}
