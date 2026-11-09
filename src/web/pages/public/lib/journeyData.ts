import { KNOWLEDGE_TRACKS, type KnowledgeTrackKey } from '@tw/shared';

/** Perguntas e regras da jornada (P2/P3), portadas de js/jornada.js (arte do Claude Design). Sem backend: tudo no navegador. */
export const AREAS: Record<string, string> = {
  backend: 'Backend',
  frontend: 'Frontend',
  dados: 'Dados',
  ux: 'UX & Design',
  produto: 'Produto',
  cloud: 'Cloud & Infraestrutura',
};

export const PERFIS: Record<string, { nome: string; desc: string }> = {
  analitica: { nome: 'Analista', desc: 'Curiosa, enxerga padrões e gosta de números.' },
  construtora: { nome: 'Construtora', desc: 'Mão na massa: gosta de fazer as coisas funcionarem.' },
  criativa: { nome: 'Criativa', desc: 'Visual e empática, pensa sempre nas pessoas.' },
  estrategista: { nome: 'Estrategista', desc: 'Organizada, com visão de negócio e prioridades claras.' },
  guardia: { nome: 'Guardiã', desc: 'Detalhista, garante que nada saia do ar.' },
};

export const TRACOS: Record<string, { grupo: string; frase: string; chip: string }> = {
  analitica: { grupo: 'analitica', frase: 'perfil analítico', chip: 'Analítica' },
  numeros: { grupo: 'analitica', frase: 'interesse por números', chip: 'Números' },
  logica: { grupo: 'construtora', frase: 'raciocínio lógico', chip: 'Lógica' },
  construtora: { grupo: 'construtora', frase: 'gosto por colocar a mão na massa', chip: 'Mão na massa' },
  criativa: { grupo: 'criativa', frase: 'criatividade', chip: 'Criativa' },
  empatia: { grupo: 'criativa', frase: 'empatia', chip: 'Empática' },
  estrategista: { grupo: 'estrategista', frase: 'visão estratégica', chip: 'Estratégica' },
  guardia: { grupo: 'guardia', frase: 'atenção a detalhes', chip: 'Detalhista' },
};

export interface Option {
  label: string;
  s: Record<string, number>;
  t: string[];
  trilhas: Partial<Record<KnowledgeTrackKey, number>>;
}
export interface Question { tipo: 'pergunta' | 'desafio'; texto: string; correta?: number; explica?: string; opcoes: Option[] }

/** 7 etapas. O período preferido (8ª etapa do protótipo) vive em P4. */
export const QUESTIONS: Question[] = [
  { tipo: 'pergunta', texto: 'Num projeto em grupo, qual papel você assume naturalmente?', opcoes: [
    { label: 'Analiso as informações e encontro padrões', s: { dados: 3 }, t: ['analitica'], trilhas: { dados: 3 } },
    { label: 'Construo a lógica que faz tudo funcionar por trás', s: { backend: 3 }, t: ['construtora'], trilhas: { desenvolvimento: 3 } },
    { label: 'Transformo necessidades em ideias de produtos digitais', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'produtos-e-negocios': 3 } },
    { label: 'Organizo o time e defino as prioridades', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'gestao-e-agilidade': 3 } },
  ] },
  { tipo: 'desafio', texto: 'Desafio relâmpago: qual é o próximo número da sequência 2, 6, 12, 20, ?', correta: 1,
    explica: 'As diferenças crescem de 2 em 2 (4, 6, 8…), então o próximo salto é 10: 20 + 10 = 30. Este desafio vale XP, mas não altera sua afinidade com as trilhas.', opcoes: [
    { label: '28', s: {}, t: [], trilhas: {} },
    { label: '30', s: {}, t: [], trilhas: {} },
    { label: '32', s: {}, t: [], trilhas: {} },
    { label: '24', s: {}, t: [], trilhas: {} },
  ] },
  { tipo: 'pergunta', texto: 'O que você mais gostaria de aprender em tecnologia?', opcoes: [
    { label: 'Criar sistemas que aprendem e ajudam a automatizar tarefas', s: {}, t: ['analitica'], trilhas: { 'inteligencia-artificial': 3 } },
    { label: 'Testar aplicativos para encontrar problemas antes de publicar', s: {}, t: ['guardia'], trilhas: { qualidade: 3 } },
    { label: 'Manter servidores, redes e serviços funcionando', s: { cloud: 3 }, t: ['guardia'], trilhas: { infraestrutura: 3 } },
    { label: 'Começar ou fazer uma transição de carreira para tecnologia', s: {}, t: ['estrategista'], trilhas: { 'carreira-em-ti': 3 } },
  ] },
  { tipo: 'pergunta', texto: 'Que impacto você gostaria de gerar com tecnologia?', opcoes: [
    { label: 'Levanto os dados de uso para ver onde as pessoas desistem', s: { dados: 2, produto: 1 }, t: ['analitica'], trilhas: { dados: 3 } },
    { label: 'Criar soluções inteligentes que facilitem tarefas do dia a dia', s: {}, t: ['analitica'], trilhas: { 'inteligencia-artificial': 3 } },
    { label: 'Transformar uma ideia em um produto útil para as pessoas', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'produtos-e-negocios': 3 } },
    { label: 'Ajudar pessoas a começar ou crescer na carreira em tecnologia', s: {}, t: ['estrategista'], trilhas: { 'carreira-em-ti': 3 } },
  ] },
  { tipo: 'desafio', texto: 'Desafio: as clientes de um app dizem que é difícil achar o botão de pagar. O que você faz primeiro?', opcoes: [
    { label: 'Implemento uma solução para deixar o fluxo mais simples', s: { frontend: 3 }, t: ['construtora'], trilhas: { desenvolvimento: 3 } },
    { label: 'Reproduzo o problema e testo soluções antes de publicar', s: {}, t: ['guardia'], trilhas: { qualidade: 3 } },
    { label: 'Entendo o valor da melhoria e priorizo o que ajuda as clientes', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'produtos-e-negocios': 3 } },
    { label: 'Organizo as prioridades e alinho os próximos passos com o time', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'gestao-e-agilidade': 3 } },
  ] },
  { tipo: 'pergunta', texto: 'Em qual atividade você gostaria de passar mais tempo?', opcoes: [
    { label: 'Construindo funcionalidades para sites e aplicativos', s: { frontend: 2, backend: 1 }, t: ['construtora'], trilhas: { desenvolvimento: 3 } },
    { label: 'Configurando nuvem e infraestrutura para manter serviços disponíveis', s: { cloud: 3 }, t: ['guardia'], trilhas: { infraestrutura: 3 } },
    { label: 'Apoiando pessoas a planejar seus próximos passos profissionais', s: {}, t: ['empatia', 'estrategista'], trilhas: { 'carreira-em-ti': 3 } },
    { label: 'Analisando informações para descobrir padrões e orientar decisões', s: { dados: 3 }, t: ['analitica'], trilhas: { dados: 3 } },
  ] },
  { tipo: 'desafio', texto: 'Desafio: um serviço precisa atender mais pessoas sem perder qualidade. O que você prioriza?', opcoes: [
    { label: 'Testo os fluxos para garantir que continuem funcionando', s: {}, t: ['guardia'], trilhas: { qualidade: 3 } },
    { label: 'Preparo a infraestrutura para suportar mais acessos', s: { cloud: 3 }, t: ['guardia'], trilhas: { infraestrutura: 3 } },
    { label: 'Coordeno as prioridades e a colaboração entre as equipes', s: { produto: 3 }, t: ['estrategista'], trilhas: { 'gestao-e-agilidade': 3 } },
    { label: 'Uso automação e IA para antecipar necessidades do serviço', s: {}, t: ['analitica'], trilhas: { 'inteligencia-artificial': 3 } },
  ] },
];

/** Respostas: índice da opção por pergunta. */
export type Answers = Record<number, number>;

export function calcXp(answers: Answers): number {
  let xp = 0;
  QUESTIONS.forEach((q, i) => {
    const a = answers[i];
    if (a == null) return;
    xp += 10;
    if (q.correta != null && a === q.correta) xp += 20;
  });
  return xp;
}

export interface JourneyResult {
  score: Record<string, number>;
  ranking: string[];
  nivelDe: (k: string) => number;
  tracos: string[];
  perfil: string;
  pct: (k: string) => number;
  trackScores: Record<KnowledgeTrackKey, number>;
  trackRanking: KnowledgeTrackKey[];
  trackLevelOf: (k: KnowledgeTrackKey) => number;
  trackPct: (k: KnowledgeTrackKey) => number;
}

/** Desempate pelas respostas da pessoa (FNV-1a): a ordem da lista favoreceria as primeiras trilhas, e o resultado não muda ao recarregar. */
function tieBreak(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function computeResult(answers: Answers): JourneyResult {
  const keys = Object.keys(AREAS);
  const score: Record<string, number> = {};
  const maxPos: Record<string, number> = {};
  keys.forEach((k) => { score[k] = 0; maxPos[k] = 0; });
  const trackScores = Object.fromEntries(KNOWLEDGE_TRACKS.map(({ key }) => [key, 0])) as Record<KnowledgeTrackKey, number>;
  const count: Record<string, number> = {};
  const ordem: string[] = [];
  const grupos: Record<string, number> = {};
  QUESTIONS.forEach((q, idx) => {
    keys.forEach((k) => { maxPos[k]! += Math.max(0, ...q.opcoes.map((o) => o.s[k] ?? 0)); });
    const a = answers[idx];
    if (a == null) return;
    const o = q.opcoes[a]!;
    Object.entries(o.s).forEach(([k, v]) => { score[k]! += v; });
    KNOWLEDGE_TRACKS.forEach(({ key }) => { trackScores[key] += o.trilhas[key] ?? 0; });
    o.t.forEach((t) => {
      if (!(t in count)) { count[t] = 0; ordem.push(t); }
      count[t]! += 1;
      const g = TRACOS[t]!.grupo;
      grupos[g] = (grupos[g] ?? 0) + 1;
    });
  });
  const ratio = (k: string) => score[k]! / (maxPos[k] || 1);
  const ranking = [...keys].sort((x, y) => ratio(y) - ratio(x) || score[y]! - score[x]!);
  const totalTrackScore = Object.values(trackScores).reduce((total, value) => total + value, 0);
  const trackRatio = (k: KnowledgeTrackKey) => totalTrackScore ? trackScores[k] / totalTrackScore : 0;
  const affinity = QUESTIONS.map((q, idx) => (q.correta == null ? answers[idx] : '')).join();
  const tie = (k: KnowledgeTrackKey) => tieBreak(`${k}:${affinity}`);
  const trackRanking = KNOWLEDGE_TRACKS.map(({ key }) => key)
    .sort((x, y) => trackScores[y] - trackScores[x] || tie(x) - tie(y));
  const tracos = [...ordem].sort((x, y) => count[y]! - count[x]!).slice(0, 3);
  ['analitica', 'criativa', 'construtora'].forEach((t) => { if (tracos.length < 3 && !tracos.includes(t)) tracos.push(t); });
  const perfil = Object.keys(grupos).sort((x, y) => grupos[y]! - grupos[x]!)[0] ?? 'construtora';
  return {
    score, ranking, tracos, perfil, trackScores, trackRanking,
    nivelDe: (k) => Math.max(1, Math.min(5, Math.round(ratio(k) * 5))),
    pct: (k) => Math.max(6, Math.round(ratio(k) * 100)),
    trackLevelOf: (k) => Math.max(1, Math.min(5, Math.round(trackRatio(k) * 5))),
    trackPct: (k) => Math.max(6, Math.round(trackRatio(k) * 100)),
  };
}

const KEY = 'tw:answers';
export function loadAnswers(): Answers | null {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Answers) : null; } catch { return null; }
}
export function saveAnswers(a: Answers | null): void {
  try { if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); } catch { /* ignora */ }
}
