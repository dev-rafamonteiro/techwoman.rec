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

export interface Option { label: string; s: Record<string, number>; t: string[] }
export interface Question { tipo: 'pergunta' | 'desafio'; texto: string; correta?: number; explica?: string; opcoes: Option[] }

/** 7 etapas. O período preferido (8ª etapa do protótipo) vive em P4. */
export const QUESTIONS: Question[] = [
  { tipo: 'pergunta', texto: 'Num projeto em grupo, qual papel você assume naturalmente?', opcoes: [
    { label: 'Analiso as informações e encontro padrões', s: { dados: 3 }, t: ['analitica'] },
    { label: 'Construo a lógica que faz tudo funcionar por trás', s: { backend: 3 }, t: ['construtora'] },
    { label: 'Cuido do visual e da experiência de quem vai usar', s: { frontend: 2, ux: 1 }, t: ['criativa'] },
    { label: 'Organizo o time e defino as prioridades', s: { produto: 3 }, t: ['estrategista'] },
  ] },
  { tipo: 'desafio', texto: 'Desafio relâmpago: qual é o próximo número da sequência 2, 6, 12, 20, ?', correta: 1,
    explica: 'As diferenças crescem de 2 em 2 (4, 6, 8…), então o próximo salto é 10: 20 + 10 = 30.', opcoes: [
    { label: '28', s: {}, t: [] },
    { label: '30', s: { dados: 2, backend: 1 }, t: ['numeros', 'logica'] },
    { label: '32', s: {}, t: [] },
    { label: '24', s: {}, t: [] },
  ] },
  { tipo: 'pergunta', texto: 'O que mais faz seus olhos brilharem?', opcoes: [
    { label: 'Descobrir respostas escondidas nos números', s: { dados: 3 }, t: ['numeros'] },
    { label: 'Uma tela bonita e fluida funcionando no celular', s: { frontend: 3 }, t: ['criativa'] },
    { label: 'Uma API rápida que aguenta milhões de acessos', s: { backend: 3 }, t: ['construtora'] },
    { label: 'Ver uma ideia virar produto no mercado', s: { produto: 3 }, t: ['estrategista'] },
  ] },
  { tipo: 'desafio', texto: 'Desafio: as clientes de um app dizem que é difícil achar o botão de pagar. O que você faz primeiro?', opcoes: [
    { label: 'Levanto os dados de uso para ver onde as pessoas desistem', s: { dados: 2, produto: 1 }, t: ['analitica'] },
    { label: 'Converso com usuárias e redesenho a tela', s: { ux: 3 }, t: ['empatia', 'criativa'] },
    { label: 'Ajusto a tela no código e publico uma nova versão', s: { frontend: 3 }, t: ['construtora'] },
    { label: 'Meço o impacto no faturamento e priorizo com o time', s: { produto: 3 }, t: ['estrategista'] },
  ] },
  { tipo: 'pergunta', texto: 'Qual ferramenta você levaria para uma ilha deserta?', opcoes: [
    { label: 'Uma planilha poderosa', s: { dados: 2 }, t: ['numeros'] },
    { label: 'Um caderno de esboços', s: { ux: 3 }, t: ['criativa'] },
    { label: 'Um notebook com terminal', s: { backend: 2 }, t: ['logica'] },
    { label: 'Um servidor que nunca cai', s: { cloud: 3 }, t: ['guardia'] },
  ] },
  { tipo: 'desafio', texto: 'Desafio: o site do evento vai receber 10 vezes mais acessos no dia da abertura. Qual é a sua jogada?', opcoes: [
    { label: 'Escalo a infraestrutura na nuvem antes do pico', s: { cloud: 3 }, t: ['guardia'] },
    { label: 'Monto um painel para acompanhar os acessos em tempo real', s: { dados: 2 }, t: ['analitica'] },
    { label: 'Otimizo as consultas e o cache da API', s: { backend: 3 }, t: ['construtora'] },
    { label: 'Aviso o público sobre os horários de menor movimento', s: { produto: 2 }, t: ['estrategista'] },
  ] },
  { tipo: 'desafio', texto: 'Desafio: o que você corrigiria primeiro no site de inscrições?', opcoes: [
    { label: 'O botão de inscrição some quando abro no celular', s: { frontend: 3 }, t: ['criativa'] },
    { label: 'O formulário grava inscrições duplicadas no banco', s: { backend: 3 }, t: ['logica'] },
    { label: 'Ninguém sabe quantas pessoas se inscrevem por dia', s: { dados: 2 }, t: ['analitica'] },
    { label: 'O site fica fora do ar durante a madrugada', s: { cloud: 3 }, t: ['guardia'] },
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
}

export function computeResult(answers: Answers): JourneyResult {
  const keys = Object.keys(AREAS);
  const score: Record<string, number> = {};
  const maxPos: Record<string, number> = {};
  keys.forEach((k) => { score[k] = 0; maxPos[k] = 0; });
  const count: Record<string, number> = {};
  const ordem: string[] = [];
  const grupos: Record<string, number> = {};
  QUESTIONS.forEach((q, idx) => {
    keys.forEach((k) => { maxPos[k]! += Math.max(0, ...q.opcoes.map((o) => o.s[k] ?? 0)); });
    const a = answers[idx];
    if (a == null) return;
    const o = q.opcoes[a]!;
    Object.entries(o.s).forEach(([k, v]) => { score[k]! += v; });
    o.t.forEach((t) => {
      if (!(t in count)) { count[t] = 0; ordem.push(t); }
      count[t]! += 1;
      const g = TRACOS[t]!.grupo;
      grupos[g] = (grupos[g] ?? 0) + 1;
    });
  });
  const ratio = (k: string) => score[k]! / (maxPos[k] || 1);
  const ranking = [...keys].sort((x, y) => ratio(y) - ratio(x) || score[y]! - score[x]!);
  const tracos = [...ordem].sort((x, y) => count[y]! - count[x]!).slice(0, 3);
  ['analitica', 'criativa', 'construtora'].forEach((t) => { if (tracos.length < 3 && !tracos.includes(t)) tracos.push(t); });
  const perfil = Object.keys(grupos).sort((x, y) => grupos[y]! - grupos[x]!)[0] ?? 'construtora';
  return {
    score, ranking, tracos, perfil,
    nivelDe: (k) => Math.max(1, Math.min(5, Math.round(ratio(k) * 5))),
    pct: (k) => Math.max(6, Math.round(ratio(k) * 100)),
  };
}

const KEY = 'tw:answers';
export function loadAnswers(): Answers | null {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Answers) : null; } catch { return null; }
}
export function saveAnswers(a: Answers | null): void {
  try { if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); } catch { /* ignora */ }
}
