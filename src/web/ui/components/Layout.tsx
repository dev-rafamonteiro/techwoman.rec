import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Logotipo TECH / WOMAN. */
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="tw-brand" aria-label="Tech Woman, ir para o início">
      <span className="tw-brand__tech">TECH</span>
      <span className="tw-brand__woman">WOMAN</span>
    </Link>
  );
}

/** Faixa de topo em gradiente com selo, título e subtítulo (P4, P6). */
export function Hero({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="tw-hero">
      {eyebrow && <span className="tw-hero__eyebrow">{eyebrow}</span>}
      <h1 className="tw-title">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ children, accent, dark, className = '' }: { children: ReactNode; accent?: boolean; dark?: boolean; className?: string }) {
  return <div className={`tw-card${accent ? ' tw-card--accent' : ''}${dark ? ' tw-card--dark' : ''} ${className}`}>{children}</div>;
}
