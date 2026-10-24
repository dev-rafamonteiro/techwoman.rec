import { test } from "@playwright/test";
import { expect, inviteFromQueue, loginMentor, newPage, registerMentee, resetWorld, type E2EWorld } from "./support.js";

/**
 * RN06: "Horário não serve" devolve a participante à fila com prioridade (declined_schedule).
 * Telas: P4, M4, M5, P6. Endpoints: E02, E22, E24, E04.
 */
test.describe.configure({ mode: "serial" });

let world: E2EWorld;
test.beforeAll(async () => {
  world = await resetWorld(2);
});
test.afterAll(async () => {
  await world?.db.drop();
});

test("recusa por horário volta para a fila com prioridade (RN06, RN03)", async ({ browser }) => {
  const mentee = await newPage(browser);
  const mentorA = await newPage(browser, { width: 1280, height: 800 });
  const mentorB = await newPage(browser, { width: 1280, height: 800 });

  const first = await registerMentee(mentee, { name: "Ana Primeira", email: "ana@exemplo.test", phone: "(81) 98888-0001", area: "dados" });
  // segunda participante, inscrita depois: sem prioridade, deve ficar atrás da Ana depois da recusa
  const other = await newPage(browser);
  await registerMentee(other, { name: "Bia Segunda", email: "bia@exemplo.test", phone: "(81) 98888-0002", area: "dados" });

  await loginMentor(mentorA, world.mentorEmail(0));
  await inviteFromQueue(mentorA, "Ana");

  await mentee.goto(first);
  await expect(mentee.getByTestId("p6-proposto")).toBeVisible();
  await mentee.getByTestId("p6-decline").click();
  await mentee.getByTestId("p6-decline-schedule").click();
  await expect(mentee.getByTestId("p6-aguardando")).toBeVisible();
  await expect(mentee.getByTestId("p6-outcome")).toBeVisible();

  // outra mentora vê a Ana primeiro, com marca de prioridade (mesmo que a Bia tenha se inscrito depois, a Ana
  // já era mais antiga; o ponto aqui é a prioridade: filtro "Só prioridade" mostra só a Ana)
  await loginMentor(mentorB, world.mentorEmail(1));
  await mentorB.goto("/mentora/aguardando");
  const items = mentorB.getByTestId("m4-list").locator("li");
  await expect(items.first()).toContainText("Ana");
  await mentorB.getByTestId("m4-priority").check();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Ana");
});
