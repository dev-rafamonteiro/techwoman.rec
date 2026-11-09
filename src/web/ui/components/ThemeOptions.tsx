import { SPECIALTIES_BY_TRACK } from '@tw/shared';

/** Opções de tema comercial agrupadas por trilha (A3, M2). Tema fora do catálogo vira opção própria, senão o campo mostraria "Selecione" com o tema ainda guardado. */
export function ThemeOptions({ current }: { current: string }) {
  const known = SPECIALTIES_BY_TRACK.some((track) => track.specialties.some((s) => s === current));
  return (
    <>
      <option value="">Selecione um tema</option>
      {current && !known && <option value={current}>{current}</option>}
      {SPECIALTIES_BY_TRACK.map((track) => (
        <optgroup key={track.key} label={track.label}>
          {track.specialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
        </optgroup>
      ))}
    </>
  );
}
