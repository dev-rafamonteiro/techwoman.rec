import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canSelfBook,
  chooseMentorForSelfBook,
  interpretPresenceText,
  inviteRowId,
  isRuleError,
  parseAnswerRowId,
  parsePresenceRowId,
  phoneFromWahaJid,
  planTransition,
  presenceMinutes,
  presenceReminderMinutes,
  presenceRowId,
  reminderSchedule,
  wahaListReplyRowId,
  wahaMessageHash,
  wahaSenderPhone,
  isInboundContactMessage,
} from "@tw/api/domain";
import type { AppointmentStatus } from "@tw/shared";
import { verifyHmacSha512Hex } from "../../src/api/lib/waha-hmac.js";
import { NotifierError, WahaNotifier, type NotifierMessage } from "../../src/api/worker/notifier.js";
import { S, min } from "./_util.js";

const APPT = "0123456789abcdef01234567";

describe("RN18 resposta digitada (interpretPresenceText)", () => {
  it.each(["sim", "Sim", "SIM!", "s", "1", "ok", "Confirmo.", "Sím", "Estarei lá", "vou sim, pode contar", "Confirmado 👍", "claro"])("%j -> confirm", (t) =>
    expect(interpretPresenceText(t)).toBe("confirm"));
  it.each(["não", "Nao", "NÃO!", "n", "2", "não posso", "Não posso ir", "não consigo ir hoje", "Cancelar", "pode desmarcar", "não, obrigada"])("%j -> cancel", (t) =>
    expect(interpretPresenceText(t)).toBe("cancel"));
  it.each(["talvez", "não sei", "sim, mas vou atrasar", "acho que sim", "vou atrasar uns minutos", "sim? não?", "oi", "", "   ", null, undefined])("%j -> não entendido (null)", (t) =>
    expect(interpretPresenceText(t)).toBeNull());
});

describe("RN18 opções da lista (rowId)", () => {
  it("presenceRowId e parsePresenceRowId fazem ida e volta", () => {
    expect(presenceRowId("confirm", APPT)).toBe(`confirmar:${APPT}`);
    expect(presenceRowId("cancel", APPT)).toBe(`cancelar:${APPT}`);
    expect(parsePresenceRowId(`confirmar:${APPT}`)).toEqual({ answer: "confirm", appointmentId: APPT });
    expect(parsePresenceRowId(` cancelar:${APPT} `)).toEqual({ answer: "cancel", appointmentId: APPT });
  });
  it.each([null, undefined, "", "confirmar", `confirmar:${APPT.slice(1)}`, `confirmar:${APPT}0`, `remarcar:${APPT}`, `confirmar:${"z".repeat(24)}`, `aceitar:${APPT}`, `recusar:${APPT}`])("%j -> null", (r) =>
    expect(parsePresenceRowId(r)).toBeNull());
});

describe("RN20 opções do convite (rowId) e texto", () => {
  it("inviteRowId e parseAnswerRowId fazem ida e volta, com a pergunta (kind) de cada família", () => {
    expect(inviteRowId("confirm", APPT)).toBe(`aceitar:${APPT}`);
    expect(inviteRowId("cancel", APPT)).toBe(`recusar:${APPT}`);
    expect(parseAnswerRowId(`aceitar:${APPT}`)).toEqual({ kind: "invite", answer: "confirm", appointmentId: APPT });
    expect(parseAnswerRowId(` recusar:${APPT} `)).toEqual({ kind: "invite", answer: "cancel", appointmentId: APPT });
    expect(parseAnswerRowId(`confirmar:${APPT}`)).toEqual({ kind: "presence", answer: "confirm", appointmentId: APPT });
    expect(parseAnswerRowId(`cancelar:${APPT}`)).toEqual({ kind: "presence", answer: "cancel", appointmentId: APPT });
    expect(parseAnswerRowId(`aceitar:${APPT}0`)).toBeNull();
    expect(parseAnswerRowId(null)).toBeNull();
  });
  it.each(["Aceito", "aceito!", "aceitar", "Aceito sim, obrigada"])("%j -> confirm", (t) => expect(interpretPresenceText(t)).toBe("confirm"));
  it.each(["Recuso", "não aceito", "vou recusar"])("%j -> cancel", (t) => expect(interpretPresenceText(t)).toBe("cancel"));
});

describe("RN18 evento do WAHA", () => {
  it("phoneFromWahaJid tira sufixo de device e domínio", () => {
    expect(phoneFromWahaJid("5511996604159:47@s.whatsapp.net")).toBe("5511996604159");
    expect(phoneFromWahaJid("5581999100001@c.us")).toBe("5581999100001");
    expect(phoneFromWahaJid("")).toBe("");
    expect(phoneFromWahaJid(null)).toBe("");
    expect(phoneFromWahaJid(undefined)).toBe("");
  });
  it("wahaSenderPhone usa SenderAlt antes do `from` (@lid)", () => {
    expect(wahaSenderPhone({ id: "x", from: "167512398385333@lid", _data: { Info: { SenderAlt: "5511996604159:47@s.whatsapp.net" } } })).toBe("5511996604159");
    expect(wahaSenderPhone({ id: "x", from: "5511996604159@c.us" })).toBe("5511996604159");
  });
  it("wahaMessageHash pega o hash final do id", () => {
    expect(wahaMessageHash("false_167512398385333@lid_3B6B4433BD4FB3D8569F")).toBe("3B6B4433BD4FB3D8569F");
    expect(wahaMessageHash("ABC")).toBe("ABC");
  });
  it("wahaListReplyRowId lê o selectedRowID; texto -> null", () => {
    expect(wahaListReplyRowId({ id: "x", _data: { Message: { listResponseMessage: { singleSelectReply: { selectedRowID: `confirmar:${APPT}` } } } } })).toBe(`confirmar:${APPT}`);
    expect(wahaListReplyRowId({ id: "x", body: "sim" })).toBeNull();
  });
  it("isInboundContactMessage: só `message` de contato, nem fromMe nem grupo", () => {
    expect(isInboundContactMessage("message", { from: "1@lid", fromMe: false })).toBe(true);
    expect(isInboundContactMessage("message", { from: "1@c.us", fromMe: true })).toBe(false);
    expect(isInboundContactMessage("message", { from: "120363@g.us", fromMe: false })).toBe(false);
    expect(isInboundContactMessage("message.ack", { from: "1@c.us", fromMe: false })).toBe(false);
    expect(isInboundContactMessage("message", { from: "1@s.whatsapp.net", fromMe: false })).toBe(true);
    expect(isInboundContactMessage("message", { from: "status@broadcast", fromMe: false })).toBe(false);
    expect(isInboundContactMessage("message", { from: "123@broadcast", fromMe: false })).toBe(false);
    expect(isInboundContactMessage("message", { from: "120363@newsletter", fromMe: false })).toBe(false);
  });
});

describe("RN18 minutos e escolha do lembrete com a lista", () => {
  const start = S(5).startAt;
  it("presenceMinutes arredonda para cima e nunca é menor que 1", () => {
    expect(presenceMinutes(start, min(start, -30))).toBe(30);
    expect(presenceMinutes(start, new Date(start.getTime() - 29.5 * 60_000))).toBe(30);
    expect(presenceMinutes(start, new Date(start.getTime() - 10_000))).toBe(1);
    expect(presenceMinutes(start, start)).toBe(1);
    expect(presenceMinutes(start, min(start, 5))).toBe(1);
  });
  it("o primeiro lembrete pelo WhatsApp (por ordem de envio) leva a lista", () => {
    const now = min(start, -120);
    const sched = reminderSchedule(start, now, [
      { minutesBefore: 5, channels: ["whatsapp"] },
      { minutesBefore: 60, channels: ["email"] },
      { minutesBefore: 30, channels: ["whatsapp", "email"] },
      { minutesBefore: 15, channels: ["whatsapp"] },
    ]);
    expect(presenceReminderMinutes(sched, true)).toBe(30);
  });
  it("sem WhatsApp disponível ou sem regra por WhatsApp: nenhum", () => {
    const sched = reminderSchedule(start, min(start, -120), [{ minutesBefore: 30, channels: ["whatsapp"] }, { minutesBefore: 15, channels: ["email"] }]);
    expect(presenceReminderMinutes(sched, false)).toBeNull();
    expect(presenceReminderMinutes(reminderSchedule(start, min(start, -120), [{ minutesBefore: 15, channels: ["email"] }]), true)).toBeNull();
    expect(presenceReminderMinutes([], true)).toBeNull();
  });
});

describe("E47 verifyHmacSha512Hex", () => {
  const key = "chave-de-teste";
  const body = '{"event":"message","payload":{"id":"x"}}';
  const sig = createHmac("sha512", key).update(body).digest("hex");
  it("aceita a assinatura certa (string ou Buffer, maiúscula ou com espaço)", () => {
    expect(verifyHmacSha512Hex(key, body, sig)).toBe(true);
    expect(verifyHmacSha512Hex(key, Buffer.from(body), sig)).toBe(true);
    expect(verifyHmacSha512Hex(key, body, sig.toUpperCase())).toBe(true);
    expect(verifyHmacSha512Hex(key, body, [sig])).toBe(true);
    expect(verifyHmacSha512Hex(key, body, ` ${sig} `)).toBe(true);
  });
  it("recusa corpo alterado, chave errada, header ausente/fora do formato e chave ausente", () => {
    expect(verifyHmacSha512Hex(key, body + " ", sig)).toBe(false);
    expect(verifyHmacSha512Hex("outra", body, sig)).toBe(false);
    expect(verifyHmacSha512Hex(key, body, undefined)).toBe(false);
    expect(verifyHmacSha512Hex(key, body, "")).toBe(false);
    expect(verifyHmacSha512Hex(key, body, sig.slice(0, 64))).toBe(false);
    expect(verifyHmacSha512Hex(key, body, "z".repeat(128))).toBe(false);
    expect(verifyHmacSha512Hex(null, body, sig)).toBe(false);
    expect(verifyHmacSha512Hex("", body, sig)).toBe(false);
  });
});

describe("RN19 transição mentee_reschedule", () => {
  const start = S(3).startAt;
  const mentee = { userId: null, role: "mentee" as const };
  const run = (status: AppointmentStatus, now: Date) => planTransition({ action: "mentee_reschedule", appointment: { status, startAt: start, expiresAt: null }, now, actor: mentee });
  it("confirmed antes do início -> cancelled; participante waiting com prioridade declined_schedule; libera travas; aviso slot_released", () => {
    const p = run("confirmed", min(start, -30));
    if (isRuleError(p)) throw new Error(p.code);
    expect(p).toMatchObject({ appointmentTo: "cancelled", menteeTo: "waiting", priority: { value: true, reason: "declined_schedule" }, notify: "slot_released", scheduleReminder: false });
    expect(p.locks).toEqual({ slotLock: false, menteeLock: false });
  });
  it("no horário ou depois -> INVALID_STATE", () => {
    for (const now of [start, min(start, 1)]) {
      const p = run("confirmed", now);
      expect(isRuleError(p) ? p.code : "OK").toBe("INVALID_STATE");
    }
  });
  it.each(["invited", "in_progress", "done", "no_show", "declined", "expired", "cancelled"] as const)("%s -> INVALID_STATE", (s) => {
    const p = run(s, min(start, -30));
    expect(isRuleError(p) ? p.code : "OK").toBe("INVALID_STATE");
  });
});

describe("RN19 escolha sozinha (canSelfBook, chooseMentorForSelfBook)", () => {
  it("só waiting com lastOutcome declined_schedule", () => {
    expect(canSelfBook({ status: "waiting", lastOutcome: "declined_schedule" })).toBe(true);
    expect(canSelfBook({ status: "waiting", lastOutcome: null })).toBe(false);
    expect(canSelfBook({ status: "waiting", lastOutcome: "cancelled_by_staff" })).toBe(false);
    expect(canSelfBook({ status: "waiting", lastOutcome: "expired" })).toBe(false);
    for (const s of ["invited", "confirmed", "done", "cancelled", "no_show"] as const) expect(canSelfBook({ status: s, lastOutcome: "declined_schedule" })).toBe(false);
  });
  it("menos mentorias ativas; empate por nome (pt-BR) e depois id", () => {
    expect(chooseMentorForSelfBook([])).toBeNull();
    expect(chooseMentorForSelfBook([{ id: "a", name: "Ana", activeCount: 2 }, { id: "b", name: "Zuleica", activeCount: 1 }])!.id).toBe("b");
    expect(chooseMentorForSelfBook([{ id: "b", name: "Érica", activeCount: 1 }, { id: "a", name: "Fernanda", activeCount: 1 }, { id: "c", name: "Bruna", activeCount: 3 }])!.id).toBe("b");
    expect(chooseMentorForSelfBook([{ id: "y", name: "Ana", activeCount: 0 }, { id: "x", name: "Ana", activeCount: 0 }])!.id).toBe("x");
  });
});

describe("WahaNotifier (servidor HTTP local)", () => {
  let server: Server;
  let url = "";
  const calls: { path: string; headers: IncomingMessage["headers"]; body: any }[] = [];
  let next: { status: number; body: unknown } = { status: 201, body: {} };
  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        calls.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : null });
        res.writeHead(next.status, { "content-type": "application/json" });
        res.end(JSON.stringify(next.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const msg = (over: Partial<NotifierMessage> = {}): NotifierMessage => ({
    channel: "whatsapp", to: "+55 81 99910-0001", type: "reminder", text: "Oi!", subject: "x", idempotencyKey: "k", payload: {}, ...over,
  });
  const list = {
    title: "Oi, Ana!", description: "faltam 30 minutos", footer: "Se preferir, responda SIM ou NÃO", button: "Responder",
    sections: [{ title: "Confirmação", rows: [{ title: "Sim, confirmo", rowId: `confirmar:${APPT}`, description: null }] }],
  };
  const n = () => new WahaNotifier(url, "api-key-teste", "default");

  it("texto: POST /api/sendText com X-Api-Key, session, chatId <dígitos>@c.us e text; devolve o hash", async () => {
    calls.length = 0;
    next = { status: 201, body: { id: "true_5581999100001@c.us_3EB0ABCDEF" } };
    const r = await n().send(msg());
    expect(r).toEqual({ providerMessageId: "3EB0ABCDEF" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/api/sendText");
    expect(calls[0]!.headers["x-api-key"]).toBe("api-key-teste");
    expect(calls[0]!.headers["content-type"]).toContain("application/json");
    expect(calls[0]!.body).toEqual({ session: "default", chatId: "5581999100001@c.us", text: "Oi!" });
  });

  it("lista: POST /api/sendList com message = lista; id em `_serialized` também serve", async () => {
    calls.length = 0;
    next = { status: 201, body: { id: { _serialized: "true_5581999100001@c.us_HASHLIST" } } };
    const r = await n().send(msg({ list }));
    expect(r).toEqual({ providerMessageId: "HASHLIST" });
    expect(calls[0]!.path).toBe("/api/sendList");
    expect(calls[0]!.headers["x-api-key"]).toBe("api-key-teste");
    expect(calls[0]!.body).toEqual({ session: "default", chatId: "5581999100001@c.us", message: list });
  });

  it("resposta sem id: enviado, sem providerMessageId", async () => {
    next = { status: 200, body: {} };
    expect(await n().send(msg())).toEqual({});
  });

  it.each([400, 401, 404, 501])("HTTP %i é permanente", async (status) => {
    next = { status, body: { error: "x" } };
    const err = await n().send(msg()).catch((e) => e);
    expect(err).toBeInstanceOf(NotifierError);
    expect(err.permanent).toBe(true);
    expect(err.message).toContain(String(status));
  });

  it.each([500, 503, 429, 408])("HTTP %i tenta de novo (não permanente)", async (status) => {
    next = { status, body: { error: "x" } };
    const err = await n().send(msg()).catch((e) => e);
    expect(err).toBeInstanceOf(NotifierError);
    expect(err.permanent).toBe(false);
  });

  it("erro de rede tenta de novo e a mensagem não leva a chave", async () => {
    const off = new WahaNotifier("http://127.0.0.1:1", "api-key-teste", "default");
    const err = await off.send(msg()).catch((e) => e);
    expect(err).toBeInstanceOf(NotifierError);
    expect(err.permanent).toBe(false);
    expect(err.message).not.toContain("api-key-teste");
  });
});
