import type { CSSProperties, ReactNode } from 'react';

/**
 * Peças gráficas extraídas da arte de P1 (design/source/techwoman.html). Decorativas: aria-hidden.
 * Cores de marca em tokens (ver tokens.css).
 */

const c = {
  plum: 'var(--tw-plum-950)', plum600: 'var(--tw-plum-600)', lilac: 'var(--tw-lilac-400)', lilac75: 'var(--tw-lilac-75)',
  orange: 'var(--tw-orange-500)', mint: 'var(--tw-mint-200)',
};

const tile: CSSProperties = { aspectRatio: '1', borderRadius: 22 };
const center: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

function Tile({ style, children }: { style?: CSSProperties; children?: ReactNode }) {
  return <div style={{ ...tile, ...style }}>{children}</div>;
}

/** Mosaico 3×3 do hero de P1 (flex 1 1 380px, máx. 460px). */
export function HeroMosaic() {
  const dots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div aria-hidden="true" style={{ flex: '1 1 380px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, maxWidth: 460 }}>
      <Tile style={{ background: c.plum600, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, padding: 22 }}>
        {dots.map((i) => <span key={i} style={{ borderRadius: '50%', background: i === 4 ? c.orange : c.lilac }} />)}
      </Tile>
      <Tile style={{ background: c.lilac, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '-50%', height: '100%', borderRadius: '50%', background: c.orange }} />
      </Tile>
      <Tile style={{ background: c.plum, ...center }}>
        <svg width="70%" height="70%" viewBox="0 0 100 100">
          <g stroke="#F26430" strokeWidth="5" strokeLinecap="round">
            <line x1="50" y1="8" x2="50" y2="92" /><line x1="8" y1="50" x2="92" y2="50" /><line x1="20" y1="20" x2="80" y2="80" /><line x1="80" y1="20" x2="20" y2="80" />
            <line x1="34" y1="11" x2="66" y2="89" /><line x1="66" y1="11" x2="34" y2="89" /><line x1="11" y1="34" x2="89" y2="66" /><line x1="11" y1="66" x2="89" y2="34" />
          </g>
          <circle cx="50" cy="50" r="12" fill="#3D0A45" />
        </svg>
      </Tile>
      <Tile style={{ background: c.plum, ...center }}>
        <svg width="66%" height="66%" viewBox="0 0 100 100" fill="none" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="38" r="24" stroke="#D98CE6" /><path d="M50 62v30M36 80h28" stroke="#F26430" />
        </svg>
      </Tile>
      <div style={{ aspectRatio: '1', borderRadius: '50%', background: c.plum600, ...center }}>
        <svg width="60%" height="60%" viewBox="0 0 100 100" fill="none" stroke="#FBEAFD" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"><path d="M18 26l24 24-24 24M46 26l24 24-24 24" /></svg>
      </div>
      <Tile style={{ background: c.lilac, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingTop: 16 }}>
        <div style={{ width: '64%', height: '82%', borderRadius: '999px 999px 0 0', background: c.plum, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '52%', height: '58%', borderRadius: '999px 999px 0 0', background: c.orange }} />
        </div>
      </Tile>
      <Tile style={{ background: c.orange, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '-30%', top: '-30%', width: '100%', height: '100%', borderRadius: '50%', background: c.plum }} />
      </Tile>
      <Tile style={{ background: c.mint, ...center }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, color: c.plum, lineHeight: 1 }}>14</span>
      </Tile>
      <Tile style={{ background: c.plum600, ...center }}>
        <svg width="70%" height="70%" viewBox="0 0 100 100" fill="none" stroke="#F26430" strokeWidth="7" strokeLinecap="round"><path d="M10 30c13-10 27 10 40 0s27-10 40 0M10 50c13-10 27 10 40 0s27-10 40 0M10 70c13-10 27 10 40 0s27-10 40 0" /></svg>
      </Tile>
    </div>
  );
}

type IconProps = { size?: number; color?: string };
const base = (size: number) => ({ 'aria-hidden': true as const, width: size, height: size, viewBox: '0 0 24 24' });
const stroke = { fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Pino de local (linha da data em P1), preenchido. */
export const PinFilledIcon = ({ size = 22, color = '#F26430' }: IconProps) => (
  <svg {...base(size)} fill={color}><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></svg>
);
/** Ícones dos cartões "O evento" (Quando, Onde, Para quem, Programação). */
export const CalendarIcon = ({ size = 26, color = '#3D0A45' }: IconProps) => (
  <svg {...base(size)} stroke={color} {...stroke}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
);
export const PinIcon = ({ size = 26, color = '#FFFFFF' }: IconProps) => (
  <svg {...base(size)} stroke={color} {...stroke}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);
export const PeopleIcon = ({ size = 26, color = '#3D0A45' }: IconProps) => (
  <svg {...base(size)} stroke={color} {...stroke}><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5" /></svg>
);
export const ListIcon = ({ size = 26, color = '#3D0A45' }: IconProps) => (
  <svg {...base(size)} stroke={color} {...stroke}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
);
