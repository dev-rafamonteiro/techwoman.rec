import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { DEFAULT_WHATSAPP_LISTS, invalidWhatsappListVariable } from "@tw/shared";
import { buildEvent } from "../../src/db/event.js";
import { render } from "../../src/api/worker/render.js";

/** PLAN, events.whatsappLists: título e texto editáveis em A7; rodapé, botão e opções fixos (RN18, RN20). */
const now = new Date("2026-11-14T11:30:00Z");
const appt = { _id: new ObjectId(), startAt: new Date("2026-11-14T12:00:00Z"), expiresAt: new Date("2026-11-14T11:45:00Z") };
const base = (event: ReturnType<typeof buildEvent>, list: "invite" | "presence") =>
  render({
    item: { type: list === "invite" ? "invite" : "reminder", payload: {} } as never,
    event,
    mentee: { name: "Ana" } as never,
    appointment: appt as never,
    mentor: { name: "Tatiana Barros" } as never,
    table: { number: 5, name: null } as never,
    links: { personal: "https://techwoman.dev/l/IEO31Kd", calendar: null },
    baseUrl: "https://techwoman.dev",
    now,
    list,
  });

describe("A7 · menus do WhatsApp", () => {
  it("sem whatsappLists no evento: textos padrão da UI-SPEC", () => {
    const r = base(buildEvent({}, now), "invite");
    expect(r.list!.title).toBe("Oi, Ana!");
    expect(r.list!.description).toBe("Tatiana Barros quer te mentorar às 9h00, na Mesa 5. Você aceita? Responda até 8h45.\nDetalhes: https://techwoman.dev/l/IEO31Kd");
  });

  it("título e texto editados entram; rodapé, botão e opções (rowId) não mudam", () => {
    const ev = buildEvent({ whatsappLists: { invite: { title: "Olá {nome}", description: "{mentora} te chama às {horario}." }, presence: { title: "Bom dia, {nome}", description: "Faltam {minutos} min. Vem?" } } }, now);
    const inv = base(ev, "invite").list!;
    expect(inv.title).toBe("Olá Ana");
    // sem {link} no texto, o link vai numa linha nova
    expect(inv.description).toBe("Tatiana Barros te chama às 9h00.\nDetalhes: https://techwoman.dev/l/IEO31Kd");
    expect([inv.footer, inv.button]).toEqual(["Se preferir, responda SIM ou NÃO", "Responder"]);
    expect(inv.sections[0]!.rows.map((r) => [r.title, r.rowId])).toEqual([["Aceito", `aceitar:${appt._id}`], ["Não posso", `recusar:${appt._id}`]]);
    const pres = base(ev, "presence").list!;
    expect([pres.title, pres.description]).toEqual(["Bom dia, Ana", "Faltam 30 min. Vem?"]);
    expect(pres.sections[0]!.rows.map((r) => r.rowId)).toEqual([`confirmar:${appt._id}`, `cancelar:${appt._id}`]);
  });

  it("variável desconhecida ou fora da lista dela é recusada", () => {
    expect(invalidWhatsappListVariable(DEFAULT_WHATSAPP_LISTS)).toBeNull();
    expect(invalidWhatsappListVariable({ ...DEFAULT_WHATSAPP_LISTS, invite: { title: "Oi", description: "faltam {minutos}" } })).toEqual({ field: "whatsappLists.invite.description", variable: "minutos" });
    expect(invalidWhatsappListVariable({ ...DEFAULT_WHATSAPP_LISTS, presence: { title: "Oi {apelido}", description: "x" } })).toEqual({ field: "whatsappLists.presence.title", variable: "apelido" });
  });
});
