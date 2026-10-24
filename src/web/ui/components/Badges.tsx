import type { AppointmentStatus, MenteeStatus } from '@tw/shared';

export type BadgeStatus = MenteeStatus | AppointmentStatus | 'free';

interface Look { label: string; tone: 'waiting' | 'invited' | 'confirmed' | 'done' | 'negative' }

/** Cores de status (UI-SPEC): Aguardando neutro · Horário proposto laranja · Confirmada menta · Concluída cinza · Não compareceu/Cancelada/Expirada vermelho suave. */
export const STATUS_LOOK: Record<BadgeStatus, Look> = {
  waiting: { label: 'Aguardando', tone: 'waiting' },
  free: { label: 'Livre', tone: 'waiting' },
  invited: { label: 'Horário proposto', tone: 'invited' },
  confirmed: { label: 'Confirmada', tone: 'confirmed' },
  in_progress: { label: 'Em andamento', tone: 'confirmed' },
  done: { label: 'Concluída', tone: 'done' },
  no_show: { label: 'Não compareceu', tone: 'negative' },
  cancelled: { label: 'Cancelada', tone: 'negative' },
  declined: { label: 'Recusada', tone: 'negative' },
  expired: { label: 'Expirada', tone: 'negative' },
};

/** Selo de status: ponto de cor + texto (nunca só cor). `label` sobrescreve o texto (ex.: "Aguardando mentora" em P6). */
export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const look = STATUS_LOOK[status];
  return (
    <span className={`tw-badge tw-badge--${look.tone}`}>
      <span className="tw-badge__dot" aria-hidden="true" />
      {label ?? look.label}
    </span>
  );
}

/** Selo de prioridade: roxo, ícone + texto. */
export function PriorityBadge() {
  return (
    <span className="tw-badge tw-badge--priority">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="#D98CE6"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></svg>
      Prioridade
    </span>
  );
}

export function AreaBadge({ label }: { label: string }) {
  return <span className="tw-badge tw-badge--area">{label}</span>;
}
