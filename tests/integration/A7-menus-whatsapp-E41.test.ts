import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WHATSAPP_LISTS } from "@tw/shared";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";

/** PLAN, events.whatsappLists: E41 devolve o padrão, grava o editado e recusa variável desconhecida. */
const api = await loadApi();

describe.skipIf(!api)("E41 · menus do WhatsApp (whatsappLists)", () => {
  let b: Booted;
  beforeAll(async () => {
    b = await bootApi(api!, "walists", { mentors: 0, mentees: 0 });
  });
  afterAll(async () => b?.close());
  const current = async () => (await b.superAdmin.get("/api/admin/event")).body.event;
  const put = async (whatsappLists: unknown) => {
    const { id: _id, slots: _slots, ...body } = await current();
    return b.superAdmin.put("/api/admin/event", { ...body, whatsappLists });
  };

  it("sem nada gravado, GET devolve o padrão", async () => {
    expect((await current()).whatsappLists).toEqual(DEFAULT_WHATSAPP_LISTS);
  });

  it("PUT grava título e texto editados", async () => {
    const lists = { ...DEFAULT_WHATSAPP_LISTS, invite: { title: "Olá {nome}", description: "{mentora} te chama às {horario}. {link}" } };
    const r = await put(lists);
    expect(r.status).toBe(200);
    expect(r.body.event.whatsappLists).toEqual(lists);
    expect((await b.t.db.collection("events").findOne({}))!.whatsappLists).toEqual(lists);
  });

  it("variável que não existe naquela mensagem: VALIDATION_ERROR com o campo", async () => {
    const r = await put({ ...DEFAULT_WHATSAPP_LISTS, invite: { title: "Oi", description: "faltam {minutos}" } });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("VALIDATION_ERROR");
    expect(r.body.details?.field).toBe("whatsappLists.invite.description");
  });

  it("título vazio ou longo demais é recusado pelo contrato", async () => {
    expect((await put({ ...DEFAULT_WHATSAPP_LISTS, presence: { title: "", description: "x" } })).status).toBe(422);
    expect((await put({ ...DEFAULT_WHATSAPP_LISTS, presence: { title: "x".repeat(61), description: "x" } })).status).toBe(422);
  });
});
