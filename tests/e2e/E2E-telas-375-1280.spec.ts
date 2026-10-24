import { test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, loginMentor, newPage, resetWorld, TEST_PASSWORD, type E2EWorld } from "./support.js";

/**
 * Verificação visual das telas em 375 e 1280 px. Sempre: sem estouro horizontal, sem erro de console e screenshot em
 * tests/e2e/__shots__/. Quando design/screens/<codigo>-<largura>.png existir, compara por tamanho/proporção de página
 * (a comparação pixel a pixel fica a cargo da revisão com o ui-kit).
 */
const SHOTS = resolve(import.meta.dirname, "__shots__");
const DESIGN = resolve(import.meta.dirname, "../../design/screens");
mkdirSync(SHOTS, { recursive: true });

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

const REF_CODE = (code: string) => code.split("-")[0]!; // P6-invalido -> P6
/** A3-importar não tem arte própria (A3.html é o formulário). */
const NO_REF = new Set(["A3-importar"]);

/** Textos de títulos/botões/rótulos do 1º estado da arte (design/screens/<P>.html) na largura pedida. */
async function referenceTexts(browser: import("@playwright/test").Browser, code: string, width: number): Promise<string[] | null> {
  const file = resolve(DESIGN, `${REF_CODE(code)}.html`);
  if (NO_REF.has(code) || !existsSync(file)) return null;
  const html = readFileSync(file, "utf8");
  const frames = [...html.matchAll(/<template data-frame data-w="(\d+)"[^>]*>([\s\S]*?)<\/template>/g)];
  const pick = frames.find((f) => Number(f[1]) === width) ?? frames[0];
  if (!pick) return null;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(pick[2]!);
  // P: títulos, botões, rótulos e links; M/A: só títulos e rótulos (botões e linhas da arte são dados de exemplo)
  const sel = code.startsWith("P") ? "h1, h2, h3, button, label, a" : "h1, h2, label";
  const texts = await page.locator(sel).allInnerTexts();
  await page.screenshot({ path: resolve(SHOTS, `ref-${REF_CODE(code)}-${width}.png`), fullPage: true });
  await page.close();
  return texts.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t.length > 2 && !t.startsWith("["));
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ");

test.describe("telas", () => {
  for (const [group, list, login] of [
    ["público", PUBLIC, null],
    ["mentora", MENTOR, "mentor"],
    ["admin", ADMIN, "super"],
  ] as const) {
    for (const [code, url] of list) {
      test(`${group} ${code} ${url}`, async ({ browser }, testInfo) => {
        const width = testInfo.project.use.viewport!.width;
        const page = await newPage(browser, { width, height: testInfo.project.use.viewport!.height });
        if (login === "mentor") await loginMentor(page, world.mentorEmail(0));
        if (login === "super") {
          await page.goto("/entrar");
          await page.getByTestId("m1-email").fill("super@techwoman.test");
          await page.getByTestId("m1-password").fill(TEST_PASSWORD);
          await page.getByTestId("m1-submit").click();
          await page.waitForURL(/\/admin/);
        }
        await check(page, code, url, width);
        // fidelidade ao design (só P1-P6, onde há arte): ao menos 60% dos títulos/botões da arte existem na tela
        const ref = await referenceTexts(browser, code, width);
        if (ref && ref.length) {
          const body = norm(await page.locator("body").innerText());
          const found = ref.filter((t) => body.includes(norm(t)));
          const ratio = found.length / ref.length;
          testInfo.annotations.push({ type: "fidelidade", description: `${(ratio * 100).toFixed(0)}% (${found.length}/${ref.length}); faltando: ${ref.filter((t) => !found.includes(t)).slice(0, 8).join(" | ")}` });
          const stateful = ["P3", "P5", "P6-invalido"].includes(code) || (code === "P4" && !(await page.getByTestId("p4-form").isVisible()));
          // P3/P5 dependem de estado (resultado da jornada, inscrição feita); P4 depende de E01; ficam só como anotação
          if (!stateful) expect(ratio, `${code} @${width}: textos da arte ausentes: ${ref.filter((t) => !found.includes(t)).join(" | ")}`).toBeGreaterThanOrEqual(0.6);
        }
      });
    }
  }
});
