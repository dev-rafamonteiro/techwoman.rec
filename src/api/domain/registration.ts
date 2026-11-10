import type { MenteeStatus } from '@tw/shared';
import { isLiveMentee } from './status.js';

export type RegistrationOutcome = 'create' | 'blocked' | 'reactivate';

/** Mensagem de RN01 para quem já tem inscrição ativa (P4 mostra como está). */
export const ALREADY_REGISTERED_MESSAGE = 'Você já está inscrita na mentoria. Procure alguém da organização do evento para ajudar com a sua inscrição.';

/**
 * RN01 · Uma inscrição ativa por pessoa no evento: e-mail normalizado ou celular de uma inscrição ativa bloqueiam a
 * nova pelo P4 (a pessoa procura a organização). `cancelled` ou `no_show` com o mesmo e-mail reativa já confirmada,
 * sem prioridade e com novo `queuedAt`. `existing` é a do mesmo e-mail; `matches`, as do mesmo e-mail ou celular.
 */
export function registrationOutcome(
  existing: { status: MenteeStatus } | null,
  matches: readonly { status: MenteeStatus }[] = existing ? [existing] : [],
): RegistrationOutcome {
  if (matches.some((m) => isLiveMentee(m.status))) return 'blocked';
  return existing ? 'reactivate' : 'create';
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
