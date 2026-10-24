export interface QueueSortable {
  id: string;
  priority: boolean;
  queuedAt: Date;
}

/**
 * RN03 · Ordem da fila: prioridade (true primeiro), depois `queuedAt` (mais antiga primeiro); desempate por id.
 * Voltar à fila por recusa ou cancelamento da mentora mantém o `queuedAt` original (quem grava não altera o campo).
 */
export function compareQueue(a: QueueSortable, b: QueueSortable): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  const d = a.queuedAt.getTime() - b.queuedAt.getTime();
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortQueue<T extends QueueSortable>(items: readonly T[]): T[] {
  return [...items].sort(compareQueue);
}
