/** Vista "Agora" do A5: o horário em andamento (ou o próximo, se nenhum estiver em andamento) e os 3 seguintes. Depois do último horário, mostra o dia inteiro. */
export const NOW_WINDOW_NEXT = 3;

export function nowWindow<S extends { startAt: string; endAt: string }>(slots: readonly S[], now: number) {
  const currentIdx = slots.findIndex((s) => new Date(s.startAt).getTime() <= now && now < new Date(s.endAt).getTime());
  const focusIdx = currentIdx >= 0 ? currentIdx : slots.findIndex((s) => new Date(s.startAt).getTime() > now);
  return { currentIdx, visible: focusIdx < 0 ? [...slots] : slots.slice(focusIdx, focusIdx + 1 + NOW_WINDOW_NEXT) };
}
