import type { ReactNode } from 'react';
import type { MenteeStaffView } from '@tw/shared';
import { PERIOD_LABELS, formatWaiting } from '../format';
import { AreaBadge, PriorityBadge, StatusBadge } from './Badges';

export interface MenteeCardProps {
  mentee: MenteeStaffView;
  /** key da área -> rótulo (de E01). */
  areaLabel: (key: string) => string;
  /** compact = linha da lista (M4); full = painel (M5, M6, A4). */
  variant?: 'compact' | 'full';
  /** Botões de ação (ex.: "Mentorar"). */
  actions?: ReactNode;
  /** Aplica a animação de saída (participante escolhida por outra mentora). */
  leaving?: boolean;
  nowMs?: number;
  showStatus?: boolean;
}

const normalizeLinkedin = (v: string) => (/^https?:\/\//i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

/** Card de participante. Nunca mostra e-mail nem telefone (a mentora não os recebe). */
export function MenteeCard({ mentee, areaLabel, variant = 'compact', actions, leaving, nowMs, showStatus }: MenteeCardProps) {
  const full = variant === 'full';
  return (
    <article className={`tw-card tw-mentee${leaving ? ' tw-mentee--leaving' : ''}`} aria-label={`Participante ${mentee.name}`}>
      <div className="tw-mentee__head">
        <span className="tw-avatar" aria-hidden="true">{mentee.name.trim().charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <h3 className="tw-mentee__name">{mentee.name}</h3>
          <div className="tw-row">
            <AreaBadge label={areaLabel(mentee.area)} />
            {mentee.priority && <PriorityBadge />}
            {showStatus && <StatusBadge status={mentee.status} />}
          </div>
        </div>
      </div>
      <div className="tw-mentee__meta">
        <span>Prefere: {PERIOD_LABELS[mentee.preferredPeriod]}</span>
        <span aria-hidden="true">·</span>
        <span>{formatWaiting(mentee.queuedAt, nowMs)}</span>
        {mentee.linkedin && (
          <>
            <span aria-hidden="true">·</span>
            <a className="tw-link" href={normalizeLinkedin(mentee.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn<span className="tw-sr-only"> (abre em nova aba)</span></a>
          </>
        )}
      </div>
      {mentee.note && <p className="tw-mentee__note" style={full ? undefined : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{mentee.note}”</p>}
      {actions && <div className="tw-row">{actions}</div>}
    </article>
  );
}
