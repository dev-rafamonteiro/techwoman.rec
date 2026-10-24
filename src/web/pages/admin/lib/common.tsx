import { useEffect, useState, type ReactNode } from 'react';
import { ENDPOINTS, type Area } from '@tw/shared';
import { ApiError, call, useQuery } from '../../../ui';
import './admin.css';

/** Cabeçalho de página com ações à direita. */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="adm-head">
      <h1>{title}</h1>
      {children && <div className="tw-row">{children}</div>}
    </div>
  );
}

export const errMsg = (e: unknown): string => (e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.');

/** Áreas do evento (E01, público): rótulos para filtros e tabelas. */
export function useAreas(): { areas: Area[]; label: (key: string) => string } {
  const q = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const areas = q.status === 'success' ? q.data.areas : [];
  return { areas, label: (k) => areas.find((a) => a.key === k)?.label ?? k };
}

/** Define o título da aba. */
export function useTitle(t: string): void {
  useEffect(() => {
    document.title = `${t} · Tech Woman`;
  }, [t]);
}

/** Debounce simples de valor de busca. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Barras horizontais em SVG/HTML acessíveis (A1 "Inscritas por área"). */
export function BarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`} data-testid="chart-area">
      {data.map((d) => (
        <div key={d.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,120px) 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
          <span>{d.label}</span>
          <span style={{ background: 'var(--tw-lilac-100)', borderRadius: 6, height: 14 }}>
            <span style={{ display: 'block', width: `${(d.value / max) * 100}%`, height: 14, borderRadius: 6, background: 'var(--tw-purple-600)' }} />
          </span>
          <strong>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Linha em SVG (A1 "Inscrições por hora"). */
export function LineChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const W = 320, H = 140, P = 20;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) => P + (data.length <= 1 ? 0 : (i * (W - 2 * P)) / (data.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`} data-testid="chart-hour">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--tw-lilac-200)" />
      <polyline fill="none" stroke="var(--tw-purple-600)" strokeWidth="2.5" points={pts} />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="var(--tw-orange-500)"><title>{`${d.label}: ${d.value}`}</title></circle>
          {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0) && <text x={x(i)} y={H - 4} fontSize="10" textAnchor="middle" fill="var(--color-ink-muted)">{d.label}</text>}
        </g>
      ))}
    </svg>
  );
}
