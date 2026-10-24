import type { SlotUnavailableReason } from '@tw/shared';

export interface InviteCheckInput {
  now: Date;
  /** Horário escolhido; null = não existe na grade do evento. */
  slot: { id: string; startAt: Date } | null;
  mentor: { status: 'active' | 'disabled'; availability: readonly string[] };
  table: { active: boolean } | null;
  minLeadMinutes: number;
  /** Só admin (E39): ignora disponibilidade e/ou antecedência, com aviso. */
  override?: { ignoreAvailability?: boolean; ignoreLeadTime?: boolean };
}

export type InviteWarning = 'OUTSIDE_MENTOR_AVAILABILITY' | 'LEAD_TIME_SHORT';

export type InviteCheck =
  | { ok: true; warnings: InviteWarning[] }
  | { ok: false; code: 'SLOT_UNAVAILABLE'; reason: SlotUnavailableReason; message: string };

/**
 * RN04 (parte estática) · Convite válido: mentora ativa; horário na disponibilidade dela; horário começa em pelo menos
 * `minLeadMinutes`; mesa ativa. As demais condições (mesa livre, mentora livre, participante `waiting`) são decididas
 * pelos índices únicos e pelo findOneAndUpdate condicional dentro da transação.
 */
export function checkInvite(i: InviteCheckInput): InviteCheck {
  const warnings: InviteWarning[] = [];
  const no = (reason: SlotUnavailableReason, message: string): InviteCheck => ({
    ok: false,
    code: 'SLOT_UNAVAILABLE',
    reason,
    message,
  });
  if (!i.slot) return no('not_in_event', 'Esse horário não existe na grade do evento.');
  if (i.mentor.status !== 'active') return no('mentor_inactive', 'Mentora desativada.');
  if (!i.table || !i.table.active) return no('table_inactive', 'Mesa inativa.');
  if (!i.mentor.availability.includes(i.slot.id)) {
    if (i.override?.ignoreAvailability) warnings.push('OUTSIDE_MENTOR_AVAILABILITY');
    else return no('not_available', 'O horário não está na disponibilidade da mentora.');
  }
  const leadMs = i.minLeadMinutes * 60_000;
  if (i.slot.startAt.getTime() - i.now.getTime() < leadMs) {
    if (i.override?.ignoreLeadTime) warnings.push('LEAD_TIME_SHORT');
    else return no('lead_time', `O horário precisa começar em pelo menos ${i.minLeadMinutes} min.`);
  }
  return { ok: true, warnings };
}

/** RN05 · `expiresAt` = o menor entre agora + janela de resposta e o início do horário menos 5 min. */
export function computeExpiry(now: Date, slotStartAt: Date, responseWindowMinutes: number): Date {
  const byWindow = now.getTime() + responseWindowMinutes * 60_000;
  const byStart = slotStartAt.getTime() - 5 * 60_000;
  return new Date(Math.min(byWindow, byStart));
}

export interface TableCandidate {
  id: string;
  number: number;
}

/**
 * RN13 · Mesa sugerida em M5: a mesa da mentoria anterior mais próxima da mentora (a mais recente que começa antes do
 * horário escolhido), se estiver livre no horário; senão a mesa livre de menor número. Sem mesa livre: null.
 */
export function suggestTable(input: {
  chosenStartAt: Date;
  mentorAppointments: readonly { tableId: string; startAt: Date }[];
  freeTables: readonly TableCandidate[];
}): { suggestedTableId: string | null; previousTableId: string | null } {
  const previous = input.mentorAppointments
    .filter((a) => a.startAt.getTime() < input.chosenStartAt.getTime())
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];
  const previousTableId = previous?.tableId ?? null;
  if (previousTableId && input.freeTables.some((t) => t.id === previousTableId)) {
    return { suggestedTableId: previousTableId, previousTableId };
  }
  const lowest = [...input.freeTables].sort((a, b) => a.number - b.number)[0];
  return { suggestedTableId: lowest?.id ?? null, previousTableId };
}
