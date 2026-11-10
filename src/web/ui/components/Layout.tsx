import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTotem } from '../../shell/totem/context';

/** Logotipo Tech Woman (imagem 2,83:1). `height` é a altura padrão do contexto; o CSS ajusta por tela. No totem, abre o painel escondido. */
export function Brand({ to = '/', height = 32 }: { to?: string; height?: 32 | 36 | 44 }) {
  const totem = useTotem();
  const img = (
    <img
      src="/brand/techwoman-logo.png"
      srcSet="/brand/techwoman-logo-600.png 600w, /brand/techwoman-logo-1200.png 1200w, /brand/techwoman-logo.png 2032w"
      sizes="(max-width: 600px) 160px, 240px"
      width={Math.round(height * 2.83)}
      height={height}
      alt="Tech Woman"
    />
  );
  if (totem) return <button type="button" className="tw-brand" onClick={totem.openPanel} data-testid="totem-logo">{img}</button>;
  return <Link to={to} className="tw-brand">{img}</Link>;
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
