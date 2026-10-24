export const REMINDER_MINUTES_BEFORE = 15;

/** RN15 · O lembrete sai 15 min antes do horário; se já passou desse ponto, sai agora. */
export function reminderSendAt(startAt: Date, now: Date): Date {
  const at = startAt.getTime() - REMINDER_MINUTES_BEFORE * 60_000;
  return new Date(Math.max(at, now.getTime()));
}

/** RN15 · No envio, só segue se a mentoria ainda está `confirmed`; senão o item é descartado (`skipped`). */
export function shouldSendReminder(appointmentStatus: string | null): boolean {
  return appointmentStatus === 'confirmed';
}

export interface ReminderRuleInput {
  minutesBefore: number;
  channels: ('email' | 'whatsapp')[];
}

/**
 * Lembretes configuráveis (A7): um envio por regra cujo horário ainda não passou. Se todos já passaram e a mentoria
 * ainda não começou (confirmada em cima da hora), sai um só, agora, com os canais da regra mais próxima do início.
 */
export function reminderSchedule(startAt: Date, now: Date, rules: readonly ReminderRuleInput[]): { minutesBefore: number; channels: ('email' | 'whatsapp')[]; sendAt: Date }[] {
  if (startAt.getTime() <= now.getTime() || rules.length === 0) return [];
  const future = rules
    .map((r) => ({ ...r, sendAt: new Date(startAt.getTime() - r.minutesBefore * 60_000) }))
    .filter((r) => r.sendAt.getTime() > now.getTime())
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
  if (future.length) return future;
  const nearest = [...rules].sort((a, b) => a.minutesBefore - b.minutesBefore)[0]!;
  return [{ ...nearest, sendAt: now }];
}
