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
