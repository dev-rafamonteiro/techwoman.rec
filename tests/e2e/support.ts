import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createTestDb, type TestDb } from "../helpers/db.js";
import { seedWorld, userDoc, type World } from "../helpers/seed.js";
import { testPasswordHash, TEST_PASSWORD } from "../helpers/app.js";
import { getCollections } from "../../src/db/collections.js";

export { expect, TEST_PASSWORD };

/** Banco do E2E: a API iniciada pelo playwright.config usa o mesmo nome (E2E_DB). */
export const E2E_DB = process.env.E2E_DB ?? "tw_e2e";

/** Script que substitui o Turnstile da Cloudflare: o desafio invisível devolve sempre "test-ok" (API em modo de teste). */
const TURNSTILE_STUB = `
window.turnstile = {
  render: function (el, opts) { window.__tsCb = opts.callback; return "w1"; },
  execute: function () { setTimeout(function () { window.__tsCb && window.__tsCb("test-ok"); }, 0); },
  reset: function () {}, remove: function () {}
};`;

export async function stubTurnstile(ctx: BrowserContext) {
  await ctx.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: TURNSTILE_STUB }));
}

export interface E2EWorld {
  db: TestDb;
  w: World;
  mentorEmail(i: number): string;
}

/** Recria o banco do E2E: evento (inscrições abertas), 20 mesas, N mentoras com senha de teste, sem participantes. */
export async function resetWorld(mentors = 2): Promise<E2EWorld> {
  const db = await createTestDb("e2e");
  // createTestDb gera nome aleatório; o E2E precisa do nome fixo que a API usa
  await db.drop();
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(db.uri);
  await client.connect();
  const fixed = client.db(E2E_DB);
  await fixed.dropDatabase();
  const w = await seedWorld(fixed, { mentors, tables: 20, mentees: 0, registrationOpen: true });
  const hash = await testPasswordHash();
  const users = getCollections(fixed).users;
  await users.deleteMany({});
  w.mentors = Array.from({ length: mentors }, (_, i) => userDoc(i + 1, { passwordHash: hash }));
  await users.insertMany(w.mentors);
  return {
    db: { ...db, client, db: fixed, dbName: E2E_DB, async drop() { await fixed.dropDatabase(); await client.close(); }, async clean() {} },
    w,
    mentorEmail: (i) => w.mentors[i]!.email,
  };
}

export async function newPage(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "America/Recife" });
  await stubTurnstile(ctx);
  return ctx.newPage();
}

export async function loginMentor(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill(email);
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/mentora\//);
}

export interface NewMentee {
  name: string;
  email: string;
  phone: string;
  area: string;
}

/** P4 -> P5; devolve o caminho pessoal (/mentoria/minha?t=...). */
export async function registerMentee(page: Page, m: NewMentee, periodLabel = /manhã/i): Promise<string> {
  await page.goto("/mentoria/inscricao");
  await page.getByTestId("p4-name").fill(m.name);
  await page.getByTestId("p4-email").fill(m.email);
  await page.getByTestId("p4-phone").fill(m.phone);
  await page.getByTestId("p4-area").selectOption(m.area);
  await page.getByText(periodLabel).first().click();
  await page.getByTestId("p4-consent").check();
  await page.getByTestId("p4-submit").click();
  await page.waitForURL(/\/mentoria\/inscricao\/ok/);
  const href = await page.getByTestId("p5-track").getAttribute("href");
  expect(href).toContain("/mentoria/minha");
  return href!;
}

/** M4 -> M5: escolhe a participante pelo nome, o primeiro horário e a mesa sugerida; envia o convite. */
export async function inviteFromQueue(page: Page, menteeName: string) {
  await page.goto("/mentora/aguardando");
  const card = page.getByTestId("m4-list").locator("li", { hasText: menteeName });
  await expect(card).toBeVisible();
  await card.getByTestId("m4-mentor").click();
  const drawer = page.getByTestId("m5");
  await expect(drawer).toBeVisible();
  // primeiro horário e, se a mesa sugerida não vier marcada, a primeira mesa livre
  await drawer.getByRole("radio").first().check({ force: true }).catch(() => drawer.getByRole("radio").first().click());
  const send = page.getByTestId("m5-send");
  if (await send.isDisabled()) await drawer.getByRole("radio").nth(1).click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(drawer).toBeHidden();
}

export const test = base;
