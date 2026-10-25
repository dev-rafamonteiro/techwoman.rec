/** Resultado da jornada (P2/P3) guardado no navegador para P4 pré-preencher a área e enviar quizScores. */
const KEY = 'tw:journey';
const PERSONAL_KEY = 'tw:personal-path';

export interface Journey {
  area: string;
  scores: Record<string, number>;
}

export function saveJourney(j: Journey): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    /* armazenamento indisponível */
  }
}

export function loadJourney(): Journey | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Journey;
    return typeof j.area === 'string' ? j : null;
  } catch {
    return null;
  }
}

/** Links de P6 (E02 201): `personalPath` (botão) e `shortPath` (link curto mostrado e copiado). */
export interface PersonalLinks {
  personalPath: string;
  shortPath?: string;
}

/** Lido por P5. Contém o token (credencial): só sessionStorage. */
export function savePersonalPath(links: PersonalLinks): void {
  try {
    sessionStorage.setItem(PERSONAL_KEY, JSON.stringify(links));
  } catch {
    /* ignora */
  }
}
export function loadPersonalPath(): PersonalLinks | null {
  try {
    const raw = sessionStorage.getItem(PERSONAL_KEY);
    if (!raw) return null;
    // versão anterior guardava só o caminho em texto
    if (raw.startsWith('/')) return { personalPath: raw };
    const v = JSON.parse(raw) as PersonalLinks;
    return typeof v.personalPath === 'string' ? v : null;
  } catch {
    return null;
  }
}
