import type { MenteeStatus } from '@tw/shared';

/**
 * RN21 · Efeito do atendimento fora da mesa na fila. Quem estava aguardando (`waiting`) teve a participação
 * concluída: vira `done` e sai da fila. Com convite ou mentoria marcada (`invited`, `confirmed`) nada muda: a
 * mentoria da mesa continua de pé. `done` e `no_show` também ficam como estão. `cancelled` não pode ser escolhida.
 */
export function walkInQueueEffect(status: MenteeStatus): { ok: true; next: MenteeStatus; leavesQueue: boolean } | { ok: false } {
  if (status === 'cancelled') return { ok: false };
  if (status === 'waiting') return { ok: true, next: 'done', leavesQueue: true };
  return { ok: true, next: status, leavesQueue: false };
}

/**
 * RN21 · Remoção do atendimento pelo admin (E53): a participante volta para a fila (com o `queuedAt` e a
 * prioridade de antes, que o atendimento não mexeu) só se saiu dela por este atendimento, continua `done`, não
 * tem mentoria na mesa e não tem outro atendimento fora da mesa ativo.
 */
export function shouldRestoreToQueue(input: {
  previousMenteeStatus: MenteeStatus | null;
  currentStatus: MenteeStatus;
  hasAppointment: boolean;
  otherActiveWalkIns: number;
}): boolean {
  return (
    input.previousMenteeStatus === 'waiting' &&
    input.currentStatus === 'done' &&
    !input.hasAppointment &&
    input.otherActiveWalkIns === 0
  );
}

export type WalkInSituationKind = 'waiting' | 'scheduled' | 'done' | 'no_show' | 'walked_in_by_me';

/** RN21 · situação mostrada em M7 para a participante encontrada na busca (E50). */
export function walkInSituation(input: { status: MenteeStatus; walkedInByMe: boolean }): WalkInSituationKind {
  if (input.walkedInByMe) return 'walked_in_by_me';
  switch (input.status) {
    case 'waiting':
      return 'waiting';
    case 'invited':
    case 'confirmed':
      return 'scheduled';
    case 'no_show':
      return 'no_show';
    default:
      return 'done';
  }
}
