import type { AppointmentStatus, MenteeStatus, OutboxType, PriorityReason, Role } from '@tw/shared';

/** Quem executa uma ação (RN17). `mentee` e `system` não são usuários de staff. */
export type ActorRole = Role | 'mentee' | 'system';
export interface Actor {
  userId: string | null;
  role: ActorRole;
}

/** Resultado padrão das regras puras: ok com dados, ou erro com o código da API. */
export type RuleError = { ok: false; code: import('@tw/shared').ErrorCode; message: string; details?: unknown };
export const fail = (code: RuleError['code'], message: string, details?: unknown): RuleError => ({
  ok: false,
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

export type { AppointmentStatus, MenteeStatus, OutboxType, PriorityReason };
