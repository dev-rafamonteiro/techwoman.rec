import type { MenteeStatus } from '@tw/shared';
import { isLiveMentee } from './status.js';

export type RegistrationOutcome = 'create' | 'resend_link' | 'reactivate';

/**
 * RN01 · Inscrição única por e-mail normalizado por evento.
 * Sem inscrição: cria. Ativa: não cria outra e reenvia o link. `cancelled` ou `no_show`: reativa como `waiting`
 * sem prioridade e com novo `queuedAt`.
 */
export function registrationOutcome(existing: { status: MenteeStatus } | null): RegistrationOutcome {
  if (!existing) return 'create';
  return isLiveMentee(existing.status) ? 'resend_link' : 'reactivate';
}

/** RN01 · e-mail normalizado: minúsculo, sem espaços. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * RN02 · Janela de inscrição: só com `registrationOpen = true` e antes do início do último horário do dia.
 * `lastSlotStartAt` = null (evento sem grade) => fechada.
 */
export function isRegistrationOpen(
  event: { registrationOpen: boolean; lastSlotStartAt: Date | null },
  now: Date,
): boolean {
  if (!event.registrationOpen || !event.lastSlotStartAt) return false;
  return now.getTime() < event.lastSlotStartAt.getTime();
}

/** RN14 (final) · O período preferido só pode ser alterado enquanto a participante está `waiting`. */
export function canUpdatePreferredPeriod(status: MenteeStatus): boolean {
  return status === 'waiting';
}
