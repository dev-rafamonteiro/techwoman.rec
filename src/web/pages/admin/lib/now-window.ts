import { EVENT_TIMEZONE } from '../../../ui/format';

/**
 * Vista "Agora" do A5: o horário em andamento (ou o próximo) e os 3 seguintes; nunca horários que já passaram.
 * A hora de agora vale no dia do evento: antes dele (ensaio, testes), às 16h aparecem os horários de 16h em diante,
 * não os primeiros da manhã. Sem horário daqui em diante, a lista sai vazia.
 */
export const NOW_WINDOW_NEXT = 3;
const DAY = 86_400_000;

/** Dia do calendário em `timeZone`, contado em dias desde 1970 (Recife não tem horário de verão). */
function dayOf(ms: number, timeZone: string): number {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY;
}

export function nowWindow<S extends { startAt: string; endAt: string }>(slots: readonly S[], now: number, timeZone: string = EVENT_TIMEZONE) {
  const first = slots[0];
  const at = first ? now + (dayOf(new Date(first.startAt).getTime(), timeZone) - dayOf(now, timeZone)) * DAY : now;
  const currentIdx = slots.findIndex((s) => new Date(s.startAt).getTime() <= at && at < new Date(s.endAt).getTime());
  const focusIdx = currentIdx >= 0 ? currentIdx : slots.findIndex((s) => new Date(s.startAt).getTime() > at);
  return { currentIdx, visible: focusIdx < 0 ? [] : slots.slice(focusIdx, focusIdx + 1 + NOW_WINDOW_NEXT) };
}
