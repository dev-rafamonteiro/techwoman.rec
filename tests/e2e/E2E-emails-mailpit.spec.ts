import { test } from "@playwright/test";
import { getAttachment, getMessage, deleteMessagesTo, mailpitUp, waitForMessages } from "../helpers/mailpit.js";
import { expect, inviteFromQueue, loginMentor, newPage, registerMentee, resetWorld, type E2EWorld } from "./support.js";

/**
 * PLAN, "Testes dos e-mails", caixa 5: no E2E, os e-mails 1, 2 e 3 chegam ao Mailpit no fluxo
 * inscrição (P4) -> convite (M4/M5) -> aceite (P6). A API do E2E não roda o worker; o teste processa a `outbox`
 * do banco do E2E com o mesmo código do worker (processOutbox) e o transporte SMTP (EMAIL_TRANSPORT=smtp) do Mailpit.
 */
test.describe.configure({ mode: "serial" });

const SMTP = { EMAIL_TRANSPORT: "smtp", SMTP_HOST: process.env.SMTP_HOST ?? "127.0.0.1", SMTP_PORT: process.env.SMTP_PORT ?? "1025", EMAIL_FROM: "Tech Woman <mentoria@techwoman.dev>" } as NodeJS.ProcessEnv;
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_WEB_PORT ?? "5180"}`;
const MENTEE_EMAIL = `e2e.emails.${Date.now()}@exemplo.test`;

let world: E2EWorld;
let up = false;

test.beforeAll(async () => {
  up = await mailpitUp();
  if (!up) return;
  world = await resetWorld(2);
  await deleteMessagesTo(MENTEE_EMAIL);
});
test.afterAll(async () => {
  if (up) await deleteMessagesTo(MENTEE_EMAIL).catch(() => {});
  await world?.db.drop();
});

/** Um passo do worker: envia tudo o que está pendente na outbox do E2E pelo SMTP do Mailpit. */
async function drainOutbox() {
  const { processOutbox } = await import("../../src/api/worker/outbox.js");
  const { notifierFromEnv } = await import("../../src/api/worker/notifier.js");
  const notifier = notifierFromEnv(SMTP, () => undefined, () => {});
  const r = await processOutbox(world.db.db, { notifier, config: { publicBaseUrl: BASE } as never });
  expect(r.failed, "envio pelo Mailpit falhou").toBe(0);
}

test("inscrição -> convite -> aceite: e-mails 1, 2 e 3 chegam ao Mailpit", async ({ browser }) => {
  test.skip(!up, "Mailpit fora do ar (docker compose -f ops/compose.dev.yaml --profile dev up -d mailpit; API http://127.0.0.1:8025)");
  const mentee = await newPage(browser);
  const mentor = await newPage(browser, { width: 1280, height: 800 });

  // e-mail 1: inscrição recebida
  const personal = await registerMentee(mentee, { name: "Joana Emails", email: MENTEE_EMAIL, phone: "(81) 99999-4321", area: "dados" });
  await drainOutbox();
  const [m1] = await waitForMessages(MENTEE_EMAIL, 1);
  expect(m1!.Subject).toBe("Recebemos sua inscrição na mentoria do Tech Woman");
  const full1 = await getMessage(m1!.ID);
  // links saem curtos (PLAN, Links curtos)
  expect(full1.HTML).toMatch(/\/l\/[0-9A-Za-z]{7}/);
  expect(full1.Text).toMatch(/\/l\/[0-9A-Za-z]{7}/);
  expect(full1.HTML + full1.Text).not.toMatch(/\{\{|\}\}/);
  expect(full1.From.Address).toBe("mentoria@techwoman.dev");

  // e-mail 2: convite de horário
  await loginMentor(mentor, world.mentorEmail(0));
  await inviteFromQueue(mentor, "Joana");
  await drainOutbox();
  const two = await waitForMessages(MENTEE_EMAIL, 2);
  const m2 = two.find((m) => /quer te mentorar às/.test(m.Subject));
  expect(m2, `assuntos: ${two.map((m) => m.Subject).join(" | ")}`).toBeTruthy();
  expect(m2!.Subject).toContain("Mentora 1");
  const full2 = await getMessage(m2!.ID);
  expect(full2.HTML).toMatch(/Mesa \d+/);
  expect(full2.HTML).toMatch(/\/l\/[0-9A-Za-z]{7}/);
  expect(full2.HTML + full2.Text).not.toMatch(/\{\{|\}\}/);

  // e-mail 3: confirmação, com .ics anexado
  await mentee.goto(personal);
  await mentee.getByTestId("p6-accept").click();
  await expect(mentee.getByTestId("p6-confirmada")).toBeVisible();
  await drainOutbox();
  const three = await waitForMessages(MENTEE_EMAIL, 3);
  const m3 = three.find((m) => /^Combinado:/.test(m.Subject));
  expect(m3, `assuntos: ${three.map((m) => m.Subject).join(" | ")}`).toBeTruthy();
  const full3 = await getMessage(m3!.ID);
  // link_agenda curto: outro código, diferente do link pessoal
  expect(new Set(full3.HTML.match(/\/l\/[0-9A-Za-z]{7}/g)).size).toBeGreaterThanOrEqual(2);
  expect(full3.HTML + full3.Text).not.toMatch(/\{\{|\}\}/);
  const atts = (full3.Attachments ?? []) as { PartID: string; FileName: string; ContentType: string }[];
  const ics = atts.find((a) => /\.ics$/i.test(a.FileName));
  expect(ics, "anexo .ics no e-mail 3").toBeTruthy();
  const body = await getAttachment(m3!.ID, ics!.PartID);
  expect(body).toMatch(/BEGIN:VEVENT/);
  expect(body).toMatch(/METHOD:PUBLISH/);

  // nenhum link dos e-mails executa ação: nenhum e-mail aponta para aceitar/recusar por GET
  for (const m of [full1, full2, full3]) expect(m.HTML).not.toMatch(/href="[^"]*(accept|aceitar|recusar|decline|confirm)[^"]*"/i);
});
