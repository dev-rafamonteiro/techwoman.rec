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

/** Link pessoal de P6 (E02 201), lido por P5. */
export function savePersonalPath(path: string): void {
  try {
    sessionStorage.setItem(PERSONAL_KEY, path);
    localStorage.setItem(PERSONAL_KEY, path);
  } catch {
    /* ignora */
  }
}
export function loadPersonalPath(): string | null {
  try {
    return sessionStorage.getItem(PERSONAL_KEY) ?? localStorage.getItem(PERSONAL_KEY);
  } catch {
    return null;
  }
}
