import { expect, newPage, resetWorld, test, type E2EWorld } from "./support.js";
import type { Page } from "@playwright/test";

/** Toten (/jornada_toten): jornada até a inscrição com o teclado da tela, painel escondido no logotipo e reinício. */
let world: E2EWorld;
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "toten é tela grande");
  world = await resetWorld(1);
});
test.afterEach(async () => {
  await world?.db.drop();
});

const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function tap(page: Page, text: string) {
  const kb = page.locator(".tw-kb");
  for (const c of text) {
    await kb.getByRole("button", { name: c === " " ? "Espaço" : new RegExp(`^${esc(c)}$`, "i") }).click();
  }
}

test("teclado da tela preenche a inscrição e o logotipo abre o painel", async ({ browser }, info) => {
  const page = await newPage(browser, { width: 1920, height: 1080 });
  await page.goto("/jornada_toten");
  await page.getByTestId("p2-start").click();
  for (let i = 0; ; i++) {
    expect(i).toBeLessThan(30);
    await page.getByTestId("p2-opt-0").click();
    const next = page.getByTestId("p2-next");
    const last = (await next.innerText()).includes("Ver meu resultado");
    await next.click();
    if (last) break;
  }
  await page.waitForURL(/\/jornada_toten\/resultado$/);
  await page.getByTestId("p3-cta").click();
  await page.waitForURL(/\/jornada_toten\/inscricao$/);

  await page.getByTestId("p4-name").click();
  await expect(page.locator(".tw-kb")).toBeVisible();
  await tap(page, "julia toten");
  await expect(page.getByTestId("p4-name")).toHaveValue("Julia Toten");
  // o campo não perde o foco ao tocar nas teclas: sem erro no meio da digitação
  await expect(page.getByTestId("p4-name")).toBeFocused();

  await page.getByTestId("p4-email").click();
  await tap(page, "julia_t-1@ex.com");
  await page.locator(".tw-kb").getByRole("button", { name: "Apagar" }).click();
  await expect(page.getByTestId("p4-email")).toHaveValue("julia_t-1@ex.co");
  await page.screenshot({ path: info.outputPath("toten-teclado-letras.png") });

  await page.getByTestId("p4-phone").click();
  await expect(page.locator(".tw-kb__pad")).toBeVisible();
  await tap(page, "81912345678");
  await expect(page.getByTestId("p4-phone")).toHaveValue("(81) 91234-5678");
  await page.screenshot({ path: info.outputPath("toten-teclado.png") });

  await page.locator(".tw-kb").getByRole("button", { name: "Pronto" }).click();
  await expect(page.locator(".tw-kb")).toBeHidden();

  await page.getByTestId("toten-logo").click();
  await expect(page.getByTestId("toten-panel")).toBeVisible();
  await page.getByText("Vertical · 1080 × 1920").click();
  await expect(page.locator(".tw-toten__stage")).toHaveCSS("width", "1080px");
  await page.getByTestId("toten-keyboard").uncheck();
  await page.screenshot({ path: info.outputPath("toten-painel.png") });
  await page.getByTestId("toten-restart").click();
  await expect(page.getByTestId("p2-start")).toBeVisible();

  // teclado desligado: tocar no campo não abre o da tela
  await page.goto("/jornada_toten/inscricao");
  await page.getByTestId("p4-name").click();
  await expect(page.locator(".tw-kb")).toBeHidden();
  await page.context().close();
});

test("confirmação no toten não mostra o link pessoal e volta ao início", async ({ browser }) => {
  const page = await newPage(browser, { width: 1920, height: 1080 });
  await page.goto("/jornada_toten/ok");
  await expect(page.getByTestId("p5-toten-email")).toBeVisible();
  await expect(page.getByTestId("p5-track")).toHaveCount(0);
  await page.getByTestId("p5-toten-restart").click();
  await expect(page).toHaveURL(/\/jornada_toten$/);
  await expect(page.getByTestId("p2-start")).toBeVisible();
  await page.context().close();
});

test("toten com vídeo: parado 5 s o vídeo cobre a tela; um toque o tira e a jornada segue de onde estava", async ({ browser }) => {
  const page = await newPage(browser, { width: 1920, height: 1080 });
  await page.goto("/jornada_toten_video");
  await page.getByTestId("p2-start").click();
  await page.getByTestId("p2-opt-0").click();
  const video = page.getByTestId("toten-video");
  await expect(video).toBeHidden();
  await expect(video).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => video.locator("video").evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  await video.click();
  await expect(video).toBeHidden();
  await expect(page).toHaveURL(/\/jornada_toten_video$/);
  await expect(page.getByTestId("p2-next")).toBeVisible();
});

test("toten com vídeo na vertical usa o vídeo 9:16", async ({ browser }) => {
  const page = await newPage(browser, { width: 1080, height: 1920 });
  await page.goto("/jornada_toten_video");
  const video = page.getByTestId("toten-video").locator("video");
  await expect(video).toHaveAttribute("src", "/toten/video.mp4");
  await page.getByTestId("toten-logo").click();
  await page.getByText("Vertical · 1080 × 1920").click();
  await page.getByRole("button", { name: "Fechar" }).last().click();
  await expect(video).toHaveAttribute("src", "/toten/video-vertical.mp4");
  await expect(page.getByTestId("toten-video")).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
});
