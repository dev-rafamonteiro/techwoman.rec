export interface TableOption {
  id: string;
  number: number;
  name?: string | null;
  location?: string | null;
  /** Ocupada naquele horário. */
  busy?: boolean;
}

/** Seletor de mesa (M5, A5). `suggestedId` recebe a dica de manter a mesma mesa (RN13). */
export function TablePicker({ tables, value, onChange, suggestedId }: {
  tables: readonly TableOption[];
  value: string | null;
  onChange: (id: string) => void;
  suggestedId?: string | null;
}) {
  return (
    <div className="tw-stack" style={{ gap: 8 }}>
      <div className="tw-tablegrid" role="radiogroup" aria-label="Mesa">
        {tables.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            disabled={t.busy}
            className={`tw-table${t.id === suggestedId ? ' tw-table--suggested' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <strong>{t.number}</strong>
            <small>{t.busy ? 'Ocupada' : t.id === suggestedId ? 'Sugerida' : t.location ?? 'Livre'}</small>
          </button>
        ))}
      </div>
      {suggestedId && value === suggestedId && (
        <span className="tw-field__hint">Mantenha a mesma mesa para não precisar trocar de lugar.</span>
      )}
    </div>
  );
}
