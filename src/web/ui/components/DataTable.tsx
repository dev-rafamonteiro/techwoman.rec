import { useMemo, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Valor em texto para ordenar e exportar CSV. Sem isto a coluna não ordena nem exporta. */
  text?: (row: T) => string | number;
}

/** CSV com BOM (abre certo no Excel pt-BR), separador ; e aspas escapadas. */
export function toCsv<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const cols = columns.filter((c) => c.text);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c.header)).join(';'), ...rows.map((r) => cols.map((c) => esc(c.text!(r))).join(';'))];
  return '﻿' + lines.join('\r\n');
}

/**
 * Tabela com filtros (slot `filters`) e exportar CSV. Linhas clicáveis abrem o detalhe (`onRowClick`).
 * Em telas estreitas rola na horizontal dentro do próprio quadro, sem rolar a página.
 * `onExport`: se informado, o botão chama o servidor (ex.: E37 com os filtros aplicados); senão exporta as linhas visíveis.
 */
export function DataTable<T>({ columns, rows, rowKey, filters, onRowClick, onExport, exportName = 'exportacao.csv', emptyTitle = 'Nada por aqui', emptyText = 'Ajuste os filtros para ver mais resultados.', caption }: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  filters?: ReactNode;
  onRowClick?: (row: T) => void;
  onExport?: () => void | Promise<void>;
  exportName?: string;
  emptyTitle?: string;
  emptyText?: string;
  caption: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [exporting, setExporting] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.text) return rows;
    return [...rows].sort((a, b) => {
      const x = col.text!(a), y = col.text!(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * sort.dir;
    });
  }, [rows, sort, columns]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      if (onExport) await onExport();
      else {
        const blob = new Blob([toCsv(sorted, columns)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = exportName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } finally { setExporting(false); }
  };

  return (
    <div className="tw-table-wrap">
      <div className="tw-toolbar">
        {filters}
        <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}>Exportar CSV</Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} text={emptyText} />
      ) : (
        <div className="tw-scroll" tabIndex={0} role="region" aria-label={caption}>
          <table className="tw-data">
            <caption className="tw-sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                    {c.text ? (
                      <button type="button" className="tw-sortbtn" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                        {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={rowKey(r)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r); } } : undefined}
                >
                  {columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
