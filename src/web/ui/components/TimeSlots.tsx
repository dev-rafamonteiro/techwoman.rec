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
export function SlotToggleGrid({ legend, slots, selected, onToggle, disabled, caption }: {
  legend: string;
  slots: readonly SlotOption[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
  /** Texto fixo sob cada horário livre de trava (ex.: "Horário gerado" numa prévia, A7), no lugar de Disponível/Indisponível. */
  caption?: string;
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
            <small>{s.locked ? `Marcada${s.caption ? ` · ${s.caption}` : ''}` : caption ?? (on ? 'Disponível' : 'Indisponível')}</small>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Seletor de horário de ESCOLHA ÚNICA (M5, A4, P6): lista radio com "Preferência dela" destacada. */
export function SlotSingleChoice({ legend, slots, value, onChange, preferredLabel = 'Preferência dela', disabled, testId, itemTestId }: {
  legend: string;
  slots: readonly SlotOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** Texto sob o horário destacado (P6, a própria participante: "Seu período preferido"). */
  preferredLabel?: string;
  disabled?: boolean;
  /** data-testid da lista e de cada horário (E2E). */
  testId?: string;
  itemTestId?: string;
}) {
  return (
    <div className="tw-slotlist" role="radiogroup" aria-label={legend} data-testid={testId}>
      {slots.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          className={`tw-slot${s.preferred ? ' tw-slot--preferred' : ''}`}
          disabled={disabled}
          onClick={() => onChange(s.id)}
          data-testid={itemTestId}
        >
          <span>{s.label}</span>
          <small>{s.preferred ? preferredLabel : s.caption ?? ''}</small>
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
