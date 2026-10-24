import { test } from "@playwright/test";
import { ObjectId } from "mongodb";
import { ApiHttp, expect, loginMentor, newPage, resetWorld, TEST_PASSWORD, type E2EWorld } from "./support.js";
import { menteeDoc, userDoc } from "../helpers/seed.js";
import { getCollections } from "../../src/db/collections.js";
import { testPasswordHash } from "../helpers/app.js";

/**
 * Conflitos de agenda na tela (M5, E24 409), prazo vencido em P6 (E04 INVITE_EXPIRED) e M2 de admin (sem E28).
 * Um mundo novo por teste: 2 mentoras, 20 mesas, participantes inseridas direto no banco.
 */
let world: E2EWorld;
test.beforeEach(async () => {
  world = await resetWorld(2);
});
test.afterEach(async () => world?.db.drop());

async function addMentees(n: number) {
  const mentees = Array.from({ length: n }, (_, i) => menteeDoc(i + 1, { name: `Joana${i + 1} Teste`, area: "dados" }));
  await getCollections(world.db.db).mentees.insertMany(mentees.map((m) => m.doc));
  return mentees;
}

/** Slot e mesa que a gaveta da mentora vai preselecionar para a participante (E23). */
async function drawerDefaults(mentorEmail: string, menteeId: ObjectId) {
  const api = await new ApiHttp().login(mentorEmail);
  const r = await api.req("GET", `/api/mentor/options?menteeId=${menteeId}`);
  expect(r.status).toBe(200);
  const table = r.body.tables.find((t: any) => t.id === r.body.suggestedTableId);
  return { slotId: r.body.selectedSlotId as string, tableId: r.body.suggestedTableId as string, tableNumber: table.number as number };
}

async function openDrawer(page: import("@playwright/test").Page, name: string) {
  await page.goto("/mentora/aguardando");
  const card = page.getByTestId("m4-list").locator("li", { hasText: name });
  await expect(card).toBeVisible();
  await card.getByTestId("m4-mentor").click();
  await expect(page.getByTestId("m5")).toBeVisible();
  await expect(page.getByTestId("m5-send")).toBeEnabled();
}

test("M5 TABLE_TAKEN: outra mentora ocupa a mesa antes do envio -> aviso da mesa, gaveta segue aberta", async ({ browser }) => {
  const [j1, j2] = await addMentees(2);
  const a = await newPage(browser);
  await loginMentor(a, world.mentorEmail(0));
  await openDrawer(a, "Joana1");

  // a mentora B pega a mesma mesa no mesmo horário com outra participante
  const d = await drawerDefaults(world.mentorEmail(0), j1!.doc._id);
  const b = await new ApiHttp().login(world.mentorEmail(1));
  const r = await b.req("POST", "/api/mentor/appointments", { menteeId: String(j2!.doc._id), slotId: d.slotId, tableId: d.tableId });
  expect(r.status, JSON.stringify(r.body)).toBe(201);

  await a.getByTestId("m5-send").click();
  await expect(a.getByText(`A Mesa ${d.tableNumber} acabou de ser ocupada nesse horário`)).toBeVisible();
  await expect(a.getByTestId("m5")).toBeVisible(); // gaveta continua aberta para escolher outra mesa
  // nenhum convite criado para a Joana1
  expect(await getCollections(world.db.db).appointments.countDocuments({ menteeId: j1!.doc._id })).toBe(0);
});

/** Outra mentora (B) convida `menteeId` no mesmo horário que a gaveta da A preselecionou. */
async function otherMentorTakesMentee(menteeId: ObjectId) {
  const d = await drawerDefaults(world.mentorEmail(0), menteeId);
  const b = await new ApiHttp().login(world.mentorEmail(1));
  const other = d.tableNumber === 1 ? 2 : 1;
  const tables = await getCollections(world.db.db).tables.find({ number: other }).toArray();
  const r = await b.req("POST", "/api/mentor/appointments", { menteeId: String(menteeId), slotId: d.slotId, tableId: String(tables[0]!._id) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
}

test("M5 MENTEE_TAKEN com tempo real (SSE): gaveta fecha, card some, aviso m4-notice", async ({ browser }) => {
  const [j1] = await addMentees(1);
  const a = await newPage(browser);
  await loginMentor(a, world.mentorEmail(0));
  await openDrawer(a, "Joana1");
  await otherMentorTakesMentee(j1!.doc._id);

  await expect(a.getByTestId("m4-notice")).toContainText("Joana1 acabou de ser escolhida por outra mentora");
  await expect(a.getByTestId("m5")).toBeHidden();
  await expect(a.getByTestId("m4").locator("li", { hasText: "Joana1" })).toHaveCount(0);
});

test("M5 MENTEE_TAKEN sem tempo real (SSE fora): ao enviar, toast 'Outra mentora acabou de convidar a Joana1', gaveta fecha", async ({ browser }) => {
  const [j1] = await addMentees(1);
  const a = await newPage(browser);
  await a.route("**/api/mentor/stream**", (r) => r.abort());
  await loginMentor(a, world.mentorEmail(0));
  await openDrawer(a, "Joana1");
  await otherMentorTakesMentee(j1!.doc._id);

  await a.getByTestId("m5-send").click();
  await expect(a.getByText("Outra mentora acabou de convidar a Joana1")).toBeVisible();
  await expect(a.getByTestId("m5")).toBeHidden();
});

test("M5 MENTOR_BUSY: a própria mentora já tem mentoria nesse horário (outra aba) -> aviso com o horário", async ({ browser }) => {
  const [j1, j2] = await addMentees(2);
  const a = await newPage(browser);
  await loginMentor(a, world.mentorEmail(0));
  await openDrawer(a, "Joana1");

  const d = await drawerDefaults(world.mentorEmail(0), j1!.doc._id);
  const sameMentor = await new ApiHttp().login(world.mentorEmail(0));
  const tables = await getCollections(world.db.db).tables.find({ number: d.tableNumber === 1 ? 2 : 1 }).toArray();
  const r = await sameMentor.req("POST", "/api/mentor/appointments", { menteeId: String(j2!.doc._id), slotId: d.slotId, tableId: String(tables[0]!._id) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);

  await a.getByTestId("m5-send").click();
  await expect(a.getByText(/Você já tem uma mentoria às \d{1,2}[h:]\d{2}/)).toBeVisible();
});

test("P6 aceitar depois de expirado (INVITE_EXPIRED): estado 'O prazo para responder terminou'", async ({ browser }) => {
  const [j1] = await addMentees(1);
  const mentor = new ApiHttp();
  await mentor.login(world.mentorEmail(0));
  const d = await drawerDefaults(world.mentorEmail(0), j1!.doc._id);
  const inv = await mentor.req("POST", "/api/mentor/appointments", { menteeId: String(j1!.doc._id), slotId: d.slotId, tableId: d.tableId });
  expect(inv.status, JSON.stringify(inv.body)).toBe(201);

  const page = await newPage(browser);
  await page.goto(`/mentoria/minha?t=${j1!.token}`);
  await expect(page.getByTestId("p6-proposto")).toBeVisible();

  // o prazo vence enquanto a participante está com a tela aberta (worker ainda não rodou)
  await getCollections(world.db.db).appointments.updateOne({ menteeId: j1!.doc._id }, { $set: { expiresAt: new Date(Date.now() - 5_000) } });
  await page.getByTestId("p6-accept").click();

  await expect(page.getByTestId("p6-expirada")).toBeVisible();
  await expect(page.getByText("O prazo para responder terminou").first()).toBeVisible();
  // não confirmou nada
  const appt = await getCollections(world.db.db).appointments.findOne({ menteeId: j1!.doc._id });
  expect(appt!.status).not.toBe("confirmed");
});

test("P6 aceitar depois de o worker expirar (INVITE_EXPIRED): estado 'O prazo para responder terminou'", async ({ browser }) => {
  const [j1] = await addMentees(1);
  const mentor = new ApiHttp();
  await mentor.login(world.mentorEmail(0));
  const d = await drawerDefaults(world.mentorEmail(0), j1!.doc._id);
  expect((await mentor.req("POST", "/api/mentor/appointments", { menteeId: String(j1!.doc._id), slotId: d.slotId, tableId: d.tableId })).status).toBe(201);

  const page = await newPage(browser);
  await page.goto(`/mentoria/minha?t=${j1!.token}`);
  await expect(page.getByTestId("p6-proposto")).toBeVisible();

  const workerPath = "../../src/api/worker/expire.js"; // caminho em variável: evita puxar os tipos do Fastify para o tsc dos testes
  const { expireInvites } = await import(workerPath);
  const far = new Date(Date.now() + 30 * 60_000);
  expect((await expireInvites(world.db.db, world.db.client, far)).expired).toBe(1);
  await page.getByTestId("p6-accept").click();

  await expect(page.getByTestId("p6-expirada")).toBeVisible();
  await expect(page.getByText("O prazo para responder terminou").first()).toBeVisible();
});

test("M2 de admin (sem papel mentor) troca a senha sem chamar E28 (PATCH /mentor/profile)", async ({ browser }) => {
  const hash = await testPasswordHash();
  await getCollections(world.db.db).users.insertOne(
    userDoc(950, { name: "Admin Novo", email: "adminnovo@techwoman.test", roles: ["admin"], passwordHash: hash, mustChangePassword: true, availability: [] }),
  );
  const page = await newPage(browser);
  const calls: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && r.method() !== "GET" && calls.push(`${r.method()} ${new URL(r.url()).pathname}`));

  await page.goto("/entrar");
  await page.getByTestId("m1-email").fill("adminnovo@techwoman.test");
  await page.getByTestId("m1-password").fill(TEST_PASSWORD);
  await page.getByTestId("m1-submit").click();
  await page.waitForURL(/\/entrar\/nova-senha/);
  await expect(page.getByTestId("m2-name")).toHaveCount(0); // campos de perfil são só da mentora

  await page.getByTestId("m2-current").fill(TEST_PASSWORD);
  await page.getByTestId("m2-new").fill("Outra-Senha-Forte-77");
  await page.getByTestId("m2-confirm").fill("Outra-Senha-Forte-77");
  await page.getByTestId("m2-submit").click();
  await page.waitForURL(/\/admin/);

  expect(calls).toContain("POST /api/auth/change-password");
  expect(calls.filter((c) => c.includes("/mentor/profile"))).toEqual([]);
});
