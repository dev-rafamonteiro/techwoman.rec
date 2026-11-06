import type { MenteeStatus } from '@tw/shared';

/**
 * RN21 · Efeito do atendimento fora da mesa na inscrição. A participante sempre termina atendida (`done`) e fora da
 * fila: `waiting` e `no_show` viram `done`; com convite ou mentoria confirmada na mesa (`invited`, `confirmed`), a
 * mentoria da mesa é cancelada (`walk_in_cancel`, libera mesa e horário) e ela vira `done`; `done` fica como está.
 * `cancelled` não pode ser escolhida (o cadastro rápido com o mesmo e-mail reativa a inscrição já como `done`).
 */
export function walkInEffect(
  status: MenteeStatus,
): { ok: true; next: 'done'; changes: boolean; cancelsAppointment: boolean } | { ok: false } {
  switch (status) {
    case 'cancelled':
      return { ok: false };
    case 'done':
      return { ok: true, next: 'done', changes: false, cancelsAppointment: false };
    case 'invited':
    case 'confirmed':
      return { ok: true, next: 'done', changes: true, cancelsAppointment: true };
    default:
      return { ok: true, next: 'done', changes: true, cancelsAppointment: false };
  }
}

/**
 * RN21 · Remoção do atendimento pelo admin (E53): a participante é descadastrada (`cancelled`, sai dos números e
 * recebe o e-mail pedindo nova inscrição) só se não tem outro atendimento fora da mesa ativo nem mentoria na mesa
 * ativa ou concluída (quem foi atendida na mesa continua atendida). Já cancelada: nada a fazer.
 */
export function shouldDeregisterOnWalkInRemoval(input: {
  currentStatus: MenteeStatus;
  otherActiveWalkIns: number;
  tableAppointments: number;
}): boolean {
  return input.currentStatus !== 'cancelled' && input.otherActiveWalkIns === 0 && input.tableAppointments === 0;
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
