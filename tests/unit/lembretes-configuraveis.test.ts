import { describe, expect, it } from "vitest";
import { reminderSchedule } from "@tw/api/domain";
import { EventConfigSchema, MAX_REMINDERS } from "@tw/shared";
import { S, min } from "./_util.js";

/** A7 · lembretes configuráveis antes de cada mentoria (até 10; RN15 é o padrão de 15 min). */
describe("lembretes configuráveis", () => {
  const start = S(5).startAt;
  const rules = [
    { minutesBefore: 30, channels: ["email" as const, "whatsapp" as const] },
    { minutesBefore: 15, channels: ["email" as const] },
    { minutesBefore: 5, channels: ["whatsapp" as const] },
  ];

  it("um envio por regra, em ordem de horário, quando todas ainda estão no futuro", () => {
    const r = reminderSchedule(start, min(start, -120), rules);
    expect(r.map((x) => [x.minutesBefore, x.sendAt.getTime()])).toEqual([
      [30, min(start, -30).getTime()],
      [15, min(start, -15).getTime()],
      [5, min(start, -5).getTime()],
    ]);
  });

  it("confirmada em cima da hora: pula as que já passaram (sem disparar várias de uma vez)", () => {
    expect(reminderSchedule(start, min(start, -10), rules).map((x) => x.minutesBefore)).toEqual([5]);
  });

  it("todas já passaram mas a mentoria não começou: sai um só, agora, com os canais da mais próxima", () => {
    const now = min(start, -3);
    expect(reminderSchedule(start, now, rules)).toEqual([{ minutesBefore: 5, channels: ["whatsapp"], sendAt: now }]);
  });

  it("mentoria já começada ou sem regras: nenhum lembrete", () => {
    expect(reminderSchedule(start, min(start, 1), rules)).toEqual([]);
    expect(reminderSchedule(start, min(start, -60), [])).toEqual([]);
  });

  it("contrato: no máximo 10, tempos de 1 a 1440 min, sem repetir, ao menos um canal", () => {
    const schema = EventConfigSchema.shape.reminders;
    const many = Array.from({ length: MAX_REMINDERS }, (_, i) => ({ minutesBefore: i + 1, channels: ["email"] }));
    expect(schema.safeParse(many).success).toBe(true);
    expect(schema.safeParse([...many, { minutesBefore: 99, channels: ["email"] }]).success).toBe(false);
    expect(schema.safeParse([{ minutesBefore: 15, channels: ["email"] }, { minutesBefore: 15, channels: ["whatsapp"] }]).success).toBe(false);
    expect(schema.safeParse([{ minutesBefore: 0, channels: ["email"] }]).success).toBe(false);
    expect(schema.safeParse([{ minutesBefore: 1441, channels: ["email"] }]).success).toBe(false);
    expect(schema.safeParse([{ minutesBefore: 10, channels: [] }]).success).toBe(false);
  });
});
