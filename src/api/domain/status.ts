import type { AppointmentStatus, MenteeStatus } from '@tw/shared';

/**
 * Travas de agenda mantidas junto do status (PLAN, "appointments"):
 * - slotLock: mesa e mentora ocupadas (único parcial por mesa×horário e mentora×horário); `no_show` solta a mesa e a
 *   mentora na hora (RN09), para outra participante poder ser marcada no mesmo horário
 * - menteeLock: participante ocupada (único parcial por participante)
 */
export function locksFor(status: AppointmentStatus): { slotLock: boolean; menteeLock: boolean } {
  switch (status) {
    case 'invited':
    case 'confirmed':
    case 'in_progress':
      return { slotLock: true, menteeLock: true };
    case 'done':
      return { slotLock: true, menteeLock: false };
    case 'no_show':
    case 'declined':
    case 'expired':
    case 'cancelled':
      return { slotLock: false, menteeLock: false };
  }
}

/** Status "ativo" da mentoria: ocupa mesa, mentora e participante. */
export function isActiveAppointment(status: AppointmentStatus): boolean {
  return status === 'invited' || status === 'confirmed' || status === 'in_progress';
}

/** Status da participante que acompanha o da mentoria (tabela do PLAN). `declined`/`expired`/`cancelled` dependem da regra. */
export function menteeStatusFor(status: AppointmentStatus): MenteeStatus | null {
  switch (status) {
    case 'invited':
      return 'invited';
    case 'confirmed':
    case 'in_progress':
      return 'confirmed';
    case 'done':
      return 'done';
    case 'no_show':
      return 'no_show';
    default:
      return null;
  }
}

/** Participante considerada com inscrição viva (RN01). */
export function isLiveMentee(status: MenteeStatus): boolean {
  return status !== 'cancelled' && status !== 'no_show';
}
