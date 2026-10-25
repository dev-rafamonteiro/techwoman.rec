import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDERS, OUTBOX_TYPES } from "@tw/shared";
import { channelsFor } from "../../src/api/lib/outbox.js";

/** PLAN, Notificações: com WhatsApp ligado, todo aviso à participante sai por e-mail e WhatsApp. */
describe("canais das notificações", () => {
  const ctx = (whatsappEnabled: boolean) => ({ config: { whatsappEnabled } }) as any;
  const mentee = { phone: "+5581999990000" };
  const replies = ["presence_confirmed", "presence_cancelled", "presence_unclear", "invite_closed", "invite_decline_link", "invite_unclear"];

  it("avisos à participante: e-mail e WhatsApp (convite expirado inclusive)", () => {
    for (const type of OUTBOX_TYPES) {
      if (type === "reminder" || type === "staff_password" || replies.includes(type)) continue;
      expect(channelsFor(ctx(true), type, mentee), type).toEqual(["email", "whatsapp"]);
      expect(channelsFor(ctx(false), type, mentee), type).toEqual(["email"]);
      expect(channelsFor(ctx(true), type, { phone: null } as any), type).toEqual(["email"]);
    }
  });

  it("lembrete padrão: 15 min por e-mail e WhatsApp; sem WhatsApp, só e-mail", () => {
    expect(DEFAULT_REMINDERS).toEqual([{ minutesBefore: 15, channels: ["whatsapp", "email"] }]);
    expect(channelsFor(ctx(true), "reminder", mentee, DEFAULT_REMINDERS[0]!.channels).sort()).toEqual(["email", "whatsapp"]);
    expect(channelsFor(ctx(false), "reminder", mentee, DEFAULT_REMINDERS[0]!.channels)).toEqual(["email"]);
  });

  it("senha da mentora só por e-mail; respostas a um toque no WhatsApp só pelo WhatsApp", () => {
    expect(channelsFor(ctx(true), "staff_password", null)).toEqual(["email"]);
    for (const type of replies) {
      expect(channelsFor(ctx(true), type as any, mentee)).toEqual(["whatsapp"]);
      expect(channelsFor(ctx(false), type as any, mentee)).toEqual([]);
    }
  });
});
