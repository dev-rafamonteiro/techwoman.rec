import { describe, expect, it } from "vitest";
import { ACTIVE_OUTBOX_CHANNELS, DEFAULT_REMINDERS, OUTBOX_CHANNELS, OutboxChannelSchema, normalizeReminders } from "@tw/shared";
import { channelsFor } from "../../src/api/lib/outbox.js";

/** PLAN, Notificações: todo aviso sai só por e-mail (WhatsApp removido em 2026-11-05). */
describe("canais das notificações", () => {
  it("todo tipo de aviso sai só por e-mail", () => {
    expect(channelsFor()).toEqual(["email"]);
    expect(ACTIVE_OUTBOX_CHANNELS).toEqual(["email"]);
  });

  it("lembrete padrão: 15 min, por e-mail", () => {
    expect(DEFAULT_REMINDERS).toEqual([{ minutesBefore: 15, channels: ["email"] }]);
  });

  it("linhas antigas da outbox com canal `whatsapp` ainda são lidas (A4/A9), mas o worker só olha o e-mail", () => {
    expect(OUTBOX_CHANNELS).toContain("whatsapp");
    expect(OutboxChannelSchema.safeParse("whatsapp").success).toBe(true);
    expect(ACTIVE_OUTBOX_CHANNELS).not.toContain("whatsapp");
  });

  it("regras de lembrete antigas com `whatsapp` viram e-mail; sem regras, o padrão", () => {
    expect(normalizeReminders([{ minutesBefore: 15, channels: ["whatsapp"] } as never])).toEqual([{ minutesBefore: 15, channels: ["email"] }]);
    expect(normalizeReminders([{ minutesBefore: 30, channels: ["email", "whatsapp"] } as never, { minutesBefore: 5 }])).toEqual([
      { minutesBefore: 30, channels: ["email"] },
      { minutesBefore: 5, channels: ["email"] },
    ]);
    expect(normalizeReminders([])).toEqual(DEFAULT_REMINDERS);
    expect(normalizeReminders(null)).toEqual(DEFAULT_REMINDERS);
  });
});
