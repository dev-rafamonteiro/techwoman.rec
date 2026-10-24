import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'mint' | 'danger' | 'ghost' | 'danger-link';

interface Common {
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const cls = (v: Variant, size: string, block?: boolean) =>
  `tw-btn tw-btn--${v}${size === 'lg' ? ' tw-btn--lg' : size === 'sm' ? ' tw-btn--sm' : ''}${block ? ' tw-btn--block' : ''}`;

/** Botão (alvo mínimo 44 px, foco visível). `loading` bloqueia cliques e anuncia a espera. */
export function Button({ variant = 'primary', size = 'md', block, loading, children, disabled, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`${cls(variant, size, block)} ${rest.className ?? ''}`} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="tw-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Link interno (React Router) com aparência de botão. */
export function LinkButton({ variant = 'primary', size = 'md', block, children, ...rest }: Omit<Common, 'loading'> & LinkProps) {
  return (
    <Link {...rest} className={`${cls(variant, size, block)} ${rest.className ?? ''}`}>
      {children}
    </Link>
  );
}

/** Link externo com aparência de botão (ex.: .ics, LinkedIn em nova aba). */
export function ExternalButton({ variant = 'secondary', size = 'md', block, children, ...rest }: Omit<Common, 'loading'> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a rel="noopener noreferrer" {...rest} className={`${cls(variant, size, block)} ${rest.className ?? ''}`}>
      {children}
    </a>
  );
}
