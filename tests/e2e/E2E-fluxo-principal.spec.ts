import { test } from "@playwright/test";
import { expect, inviteFromQueue, loginMentor, newPage, registerMentee, resetWorld, type E2EWorld } from "./support.js";

/**
 * PLAN, testes obrigatórios: P4 -> M4/M5 -> P6 aceitar -> M6 concluir.
 * Telas: P4, P5, M1, M4, M5, P6, M6. Endpoints: E02, E22, E23, E24, E03, E04, E25, E26.
 */
test.describe.configure({ mode: "serial" });

let world: E2EWorld;
test.beforeAll(async () => {
  world = await resetWorld(2);
});
test.afterAll(async () => {
  await world?.db.drop();
});

test("P4 -> M4/M5 -> P6 aceitar -> M6 concluir", async ({ browser }) => {
  const mentee = await newPage(browser);
  const mentor = await newPage(browser, { width: 1280, height: 800 });

  // P4/P5: inscrição
  const personal = await registerMentee(mentee, { name: "Joana Teste", email: "joana@exemplo.test", phone: "(81) 99999-1234", area: "dados" });

  // M1/M4/M5: a mentora faz login, vê a participante na fila (sem contato) e convida
  await loginMentor(mentor, world.mentorEmail(0));
  await mentor.goto("/mentora/aguardando");
  await expect(mentor.getByTestId("m4-list")).toContainText("Joana");
  await expect(mentor.getByTestId("m4-list")).not.toContainText("joana@exemplo.test");
  await expect(mentor.getByTestId("m4-list")).not.toContainText("99999-1234");
  await inviteFromQueue(mentor, "Joana");

  // P6: proposta recebida -> aceitar
  await mentee.goto(personal);
  await expect(mentee.getByTestId("p6-proposto")).toBeVisible();
  await mentee.getByTestId("p6-accept").click();
  await expect(mentee.getByTestId("p6-confirmada")).toBeVisible();

  // M6: confirmada aparece na agenda -> iniciar -> concluir
  await mentor.goto("/mentora/agenda");
  const row = mentor.getByTestId("m6-row").filter({ hasText: "Joana" });
  await expect(row).toBeVisible();
  await row.getByTestId("m6-start").click();
  await row.getByTestId("m6-finish").click();

  // P6 reflete a conclusão (atualiza sozinho; recarrega para não depender do polling de 30 s)
  await mentee.reload();
  await expect(mentee.getByTestId("p6-concluida")).toBeVisible();

  // e a fila da mentora não tem mais a participante
  await mentor.goto("/mentora/aguardando");
  await expect(mentor.getByTestId("m4")).toBeVisible();
  await expect(mentor.getByTestId("m4")).not.toContainText("Joana");
});
