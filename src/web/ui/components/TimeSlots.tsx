import type { ReactNode } from 'react';
import { formatClock } from '../format';

export interface SlotOption {
  id: string;
  /** "14h20" já formatado ou ISO; use `label`. */
  label: string;
  /** Texto pequeno sob o horário (nome da participante, "Preferência dela"…). */
  caption?: string;
  /** Travado (mentoria marcada): não pode ser alterado. */
  locked?: boolean;
  preferred?: boolean;
}

/** Seletor de horário LIGA/DESLIGA (M3, A3): cada horário é um botão "Disponível". */
export function SlotToggleGrid({ legend, slots, selected, onToggle, disabled }: {
  legend: string;
  slots: readonly SlotOption[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="tw-slotgrid" disabled={disabled}>
      <legend className="tw-sr-only">{legend}</legend>
      {slots.map((s) => {
        const on = selected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className="tw-slot"
            aria-pressed={on}
            disabled={s.locked}
            onClick={() => onToggle(s.id)}
          >
            {s.label}
            <small>{s.locked ? `Marcada${s.caption ? ` · ${s.caption}` : ''}` : on ? 'Disponível' : 'Indisponível'}</small>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Seletor de horário de ESCOLHA ÚNICA (M5, A4): lista radio com "Preferência dela" destacada. */
export function SlotSingleChoice({ legend, slots, value, onChange }: {
  legend: string;
  slots: readonly SlotOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tw-slotlist" role="radiogroup" aria-label={legend}>
      {slots.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          className={`tw-slot${s.preferred ? ' tw-slot--preferred' : ''}`}
          onClick={() => onChange(s.id)}
        >
          <span>{s.label}</span>
          <small>{s.preferred ? 'Preferência dela' : s.caption ?? ''}</small>
        </button>
      ))}
    </div>
  );
}

/** Atalhos de M3: "Manhã inteira", "Tarde inteira", "Limpar". `hhmm` do slot é comparado a 12:00. */
export function slotShortcut(slots: readonly { id: string; startHHmm: string }[], kind: 'morning' | 'afternoon' | 'clear'): Set<string> {
  if (kind === 'clear') return new Set();
  return new Set(slots.filter((s) => (kind === 'morning') === (s.startHHmm < '12:00')).map((s) => s.id));
}

export const slotLabel = (hhmm: string): ReactNode => formatClock(hhmm);
