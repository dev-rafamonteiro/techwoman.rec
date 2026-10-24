import { useEffect, useState, type ReactNode } from 'react';
import { ENDPOINTS, type Area } from '@tw/shared';
import { ApiError, call, useQuery } from '../../../ui';
import './admin.css';

/** Cabeçalho de página com ações à direita. */
export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="adm-head">
      <div className="tw-stack" style={{ gap: 4 }}>
        <h1>{title}</h1>
        {sub && <p className="adm-sub">{sub}</p>}
      </div>
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

/** Barras horizontais acessíveis (A1 "Inscritas por área"), com alternância para tabela como no design. */
export function BarChart({ data, label, title }: { data: { label: string; value: number }[]; label: string; title: string }) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <>
      <div className="adm-panel__head">
        <h2>{title}</h2>
        <button type="button" className="adm-pillbtn" aria-pressed={table} onClick={() => setTable((v) => !v)}>{table ? 'Ver gráfico' : 'Ver tabela'}</button>
      </div>
      {table ? (
        <table className="adm-table-sm"><thead><tr><th scope="col">Área</th><th scope="col">Inscritas</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table>
      ) : (
        <div className="adm-bars" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`} data-testid="chart-area">
          {data.map((d) => (
            <div key={d.label} className="adm-bars__row" title={`${d.label}: ${d.value} inscritas`}>
              <span>{d.label}</span>
              <span className="adm-bars__track"><span className="adm-bars__fill" style={{ width: `${(d.value / max) * 100}%` }} /></span>
              <strong>{d.value}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Linha em SVG (A1 "Inscrições por hora"): grade, eixo com 4 marcas e valor ao passar o mouse, como no design. */
export function LineChart({ data, label, title }: { data: { label: string; value: number }[]; label: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = 20, bottom = 170, left = 36, right = 390;
  const step = Math.max(1, Math.ceil(Math.max(1, ...data.map((d) => d.value)) / 3));
  const max = step * 3;
  const x = (i: number) => (data.length <= 1 ? (left + right) / 2 : left + 24 + (i * (right - left - 36)) / (data.length - 1));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const ticks = [3, 2, 1, 0].map((k) => k * step);
  const showLabel = (i: number) => data.length <= 8 || i % Math.ceil(data.length / 8) === 0;
  const hv = hover != null ? data[hover] : null;
  return (
    <>
      <div className="adm-panel__head" style={{ alignItems: 'baseline' }}>
        <h2>{title}</h2>
        <span className="adm-panel__hint">{hv ? `${hv.label}: ${hv.value} ${hv.value === 1 ? 'inscrição' : 'inscrições'}` : 'Passe o mouse sobre a linha'}</span>
      </div>
      <svg viewBox="0 0 400 200" width="100%" style={{ overflow: 'visible' }} role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`} data-testid="chart-hour">
        <g stroke="#F1E6F3" strokeWidth="1">{ticks.map((t) => <line key={t} x1={left} y1={y(t)} x2={right} y2={y(t)} />)}</g>
        <g fill="var(--tw-muted)" fontSize="11" fontFamily="Manrope, sans-serif">{ticks.map((t) => <text key={t} x={28} y={y(t) + 4} textAnchor="end">{t}</text>)}</g>
        <polyline fill="none" stroke="var(--tw-purple-600)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')} />
        {hv && <line x1={x(hover!)} y1={top} x2={x(hover!)} y2={bottom} stroke="var(--tw-lilac-400)" strokeDasharray="3 3" />}
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.value)} r="5" fill="var(--tw-purple-600)" stroke="#fff" strokeWidth="2"><title>{`${d.label}: ${d.value}`}</title></circle>
            <rect x={x(i) - 18} y={10} width={36} height={170} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {showLabel(i) && <text x={x(i)} y={190} textAnchor="middle" fill="var(--tw-muted)" fontSize="11" fontFamily="Manrope, sans-serif">{d.label}</text>}
          </g>
        ))}
      </svg>
    </>
  );
}

/** Interruptor (role=switch), como na referência de A7. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="adm-switch" onClick={() => onChange(!checked)}>
      <i aria-hidden="true" />
      {label}
    </button>
  );
}
