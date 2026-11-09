import { KNOWLEDGE_TRACKS, SPECIALTIES_BY_TRACK, trackKeysForSpecialties } from '@tw/shared';

/** "Trilha: X" para o tema escolhido; sem hint se o tema não é do catálogo. */
export function themeTrackHint(theme: string): string | undefined {
  const key = theme ? trackKeysForSpecialties([theme])[0] : undefined;
  const label = KNOWLEDGE_TRACKS.find((t) => t.key === key)?.label;
  return label ? `Trilha: ${label}` : undefined;
}

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
