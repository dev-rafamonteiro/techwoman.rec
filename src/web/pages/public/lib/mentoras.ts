/**
 * P7 · regras puras da página "As mentoras" (busca e avatar), sem React nem DOM: os testes unitários importam este
 * arquivo no Node.
 */
import type { PublicMentor } from '@tw/shared';
import { KNOWLEDGE_TRACKS, trackKeysForSpecialties } from '@tw/shared';

/** Minúsculas, sem acento e com espaços simples: "  Liderança  TÉCNICA " -> "lideranca tecnica". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto em que a busca procura: nome, empresa, áreas (rótulo), temas e bio, já normalizado. */
export function searchText(m: Pick<PublicMentor, 'name' | 'organization' | 'areas' | 'themes' | 'bio'>): string {
  const tracks = trackKeysForSpecialties(m.themes)
    .map((key) => KNOWLEDGE_TRACKS.find((track) => track.key === key)?.label ?? '');
  return normalizeSearch([m.name, m.organization ?? '', ...m.areas.map((a) => a.label), ...m.themes, ...tracks, m.bio ?? ''].join(' '));
}

/**
 * Filtra pela busca livre: cada palavra digitada precisa aparecer em algum campo ("dados recife" acha quem tem as
 * duas), sem diferenciar acento e maiúscula. Busca vazia devolve a lista inteira, na mesma ordem.
 */
export function filterMentors<T extends Pick<PublicMentor, 'name' | 'organization' | 'areas' | 'themes' | 'bio'>>(mentors: readonly T[], query: string): T[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...mentors];
  return mentors.filter((m) => {
    const text = searchText(m);
    return words.every((w) => text.includes(w));
  });
}

/** "1 mentora", "3 mentoras", "2 de 23 mentoras". */
export function resultCountLabel(shown: number, total: number): string {
  const noun = (n: number) => (n === 1 ? 'mentora' : 'mentoras');
  return shown === total ? `${total} ${noun(total)}` : `${shown} de ${total} ${noun(total)}`;
}
