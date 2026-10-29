import { describe, expect, it } from 'vitest';
import { INITIAL_BRADESCO_MENTORS } from '@tw/shared';
import { AREAS, getMentorQuestions, MENTOR_QUESTION_COUNT, QUESTIONS, STAGE_QUESTION, TRAILS, calcXp, computeResult } from '../../src/web/pages/public/lib/journeyData.js';
import { mentorsForAnswers, mentorsForStage, rankMentors, type PublicMentor } from '../../src/web/pages/public/lib/mentorMatching.js';

const areas = Object.keys(AREAS) as (keyof typeof AREAS)[];
const mentorDomains: Record<keyof typeof AREAS, string[]> = {
  carreira: ['Transição de carreira', 'Posicionamento profissional', 'Currículo', 'Networking'],
  dados: ['Engenharia de Dados', 'Análise de Dados', 'Ciência de Dados', 'Power BI', 'Databricks', 'Pipeline de Dados'],
  ia: ['Inteligência Artificial', 'Machine Learning', 'Agentes de IA', 'LLM', 'Prompt Engineering'],
  desenvolvimento: ['Backend', 'Frontend', 'Desenvolvimento Full Stack', 'Java', 'ServiceNow', 'Qualidade de Software', 'Clean Code'],
  produto_plataformas: ['Produtos Digitais', 'Discovery', 'Delivery', 'Plataformas', 'Arquitetura'],
  lideranca: ['Liderança', 'Gestão de Pessoas', 'Comunicação', 'Influência', 'Metodologia Ágil'],
  infraestrutura: ['Infraestrutura', 'Cloud', 'Azure', 'AWS', 'AIOps', 'Observabilidade', 'Domain Controller'],
};
const mentors: PublicMentor[] = areas.map((area, index) => {
  const areaName = AREAS[area] ?? area;
  return {
    id: `mentor-${index}`,
    name: `Mentora ${areaName}`,
    expertise: areaName,
    city: 'Recife',
    linkedin: null,
    bio: '',
    photoUrl: null,
    themes: [{ name: areaName, domains: mentorDomains[area] ?? [] }],
    slots: [{ id: '10:00', time: '10h–10h45', topic: areaName, available: true }],
  };
});
const catalogMentors: PublicMentor[] = INITIAL_BRADESCO_MENTORS.map((mentor) => ({
  id: mentor.name,
  name: mentor.name,
  expertise: mentor.expertise ?? '',
  city: mentor.city,
  linkedin: mentor.linkedin,
  bio: mentor.bio,
  photoUrl: mentor.photoUrl,
  themes: mentor.themes.map((theme) => ({ name: theme.name ?? '', domains: [...(theme.domains ?? [])] })),
  slots: mentor.slots.map((slot) => ({ ...slot, available: true })),
}));

describe('matching de mentoras Bradesco', () => {
  it('mantém sete afinidades detalhadas e exatamente três trilhas macro', () => {
    const areaKeys = Object.keys(AREAS);
    expect(areaKeys).toEqual(['carreira', 'dados', 'ia', 'desenvolvimento', 'produto_plataformas', 'lideranca', 'infraestrutura']);
    expect(TRAILS.map((trail) => trail.key)).toEqual(['transition', 'technical', 'leadership']);
    expect(TRAILS).toHaveLength(3);
    expect(TRAILS[0]?.title).toBe('Transição de Carreira');
    expect(TRAILS[1]?.title).toBe('Crescimento e Especialização Técnica');
    expect(TRAILS[2]?.title).toBe('Liderança e Gestão');
    for (const question of QUESTIONS) {
      for (const option of question.opcoes) {
        expect(Object.keys(option.s).every((key) => areaKeys.includes(key))).toBe(true);
        expect(Object.keys(option.s).length).toBeGreaterThan(0);
        expect(option.matchTerms.length).toBeGreaterThan(0);
      }
      expect(question.tipo).toBe('pergunta');
      expect(question.opcoes.length).toBeGreaterThan(1);
    }
    expect(computeResult({ 0: 0 }).ranking).toHaveLength(areaKeys.length);
  });

  it('mantém Dados e IA como afinidades distintas no resultado e no match técnico', () => {
    expect(computeResult({ 2: 0 }).score.dados).toBeGreaterThan(0);
    expect(computeResult({ 2: 0 }).score.ia).toBe(0);
    expect(computeResult({ 2: 1 }).score.ia).toBeGreaterThan(0);
    expect(computeResult({ 2: 1 }).score.dados).toBe(0);

    const dataMentor = mentors.find((mentor) => mentor.expertise === AREAS.dados)!;
    const aiMentor = mentors.find((mentor) => mentor.expertise === AREAS.ia)!;
    const dataRanking = rankMentors([dataMentor, aiMentor], {}, { 0: 1, 1: 0, 2: 0 }, 'data-focus');
    const aiRanking = rankMentors([dataMentor, aiMentor], {}, { 0: 1, 1: 1, 2: 0 }, 'ai-focus');
    expect(dataRanking[0]?.id).toBe(dataMentor.id);
    expect(aiRanking[0]?.id).toBe(aiMentor.id);
  });

  it('pergunta primeiro o momento profissional e adapta as duas perguntas seguintes', () => {
    expect(STAGE_QUESTION.texto).toBe('Em que momento da sua trajetória você está?');
    expect(STAGE_QUESTION.opcoes.map((option) => option.stage).sort()).toEqual(['leadership', 'technical', 'transition']);
    for (const stage of ['transition', 'technical', 'leadership'] as const) {
      const questions = getMentorQuestions(stage);
      expect(questions).toHaveLength(MENTOR_QUESTION_COUNT);
      expect(questions.slice(1).every((question) => question.opcoes.every((option) => option.stage === stage))).toBe(true);
      expect(questions.every((question) => question.opcoes.every((option) => option.areas.length > 0 && option.matchTerms.length > 0))).toBe(true);
    }
  });

  it('adapta a terceira pergunta ao tema escolhido na pergunta anterior', () => {
    const dataFocus = getMentorQuestions('technical', 0)[2]!;
    const aiFocus = getMentorQuestions('technical', 1)[2]!;
    const softwareFocus = getMentorQuestions('technical', 2)[2]!;
    const productFocus = getMentorQuestions('technical', 3)[2]!;
    expect(dataFocus.texto).not.toBe(softwareFocus.texto);
    expect(aiFocus.texto).not.toBe(dataFocus.texto);
    expect(softwareFocus.texto).not.toBe(productFocus.texto);
    expect(dataFocus.opcoes.every((option) => option.areas.includes('dados'))).toBe(true);
    expect(aiFocus.opcoes.every((option) => option.areas.includes('ia') || option.areas.includes('desenvolvimento'))).toBe(true);
    expect(softwareFocus.opcoes.some((option) => option.matchTerms.includes('testes funcionais'))).toBe(true);

    const leadershipPeopleFocus = getMentorQuestions('leadership', 0)[2]!;
    const leadershipInfluenceFocus = getMentorQuestions('leadership', 1)[2]!;
    expect(leadershipPeopleFocus.texto).not.toBe(leadershipInfluenceFocus.texto);
  });

  it('evita repetir os enunciados entre aprofundamento adaptativo e perguntas de afinidade', () => {
    const affinityTexts = new Set(QUESTIONS.map((question) => question.texto));
    for (const stage of ['transition', 'technical', 'leadership'] as const) {
      for (const focusIndex of [0, 1, 2, 3, 4, 5]) {
        const journeyTexts = getMentorQuestions(stage, focusIndex).map((question) => question.texto);
        expect(new Set(journeyTexts).size).toBe(journeyTexts.length);
        expect(journeyTexts.slice(1).every((text) => !affinityTexts.has(text))).toBe(true);
      }
    }
    expect(affinityTexts.size).toBe(QUESTIONS.length);
  });

  it('inclui todas as respostas de afinidade e momento profissional no XP', () => {
    const aptitudeAnswers = Object.fromEntries(QUESTIONS.map((_, index) => [index, 0]));
    const momentAnswers = Object.fromEntries(Array.from({ length: MENTOR_QUESTION_COUNT }, (_, index) => [index, 0]));
    expect(calcXp(aptitudeAnswers, momentAnswers)).toBe(100);
    expect(calcXp(aptitudeAnswers, {})).toBe(70);
  });

  it('usa cada uma das sete respostas de afinidade e três respostas de momento no ranking', () => {
    const aptitudeAnswers = Object.fromEntries(QUESTIONS.map((_, index) => [index, 0]));
    const momentAnswers = { 0: 1, 1: 1, 2: 1 };
    const baseScores = new Map(rankMentors(catalogMentors, aptitudeAnswers, momentAnswers, 'same')
      .map((mentor) => [mentor.id, mentor.match]));

    QUESTIONS.forEach((question, index) => {
      const changed = { ...aptitudeAnswers, [index]: question.opcoes.length - 1 };
      const changedScores = rankMentors(catalogMentors, changed, momentAnswers, 'same');
      expect(changedScores.some((mentor) => mentor.match !== baseScores.get(mentor.id)), `pergunta de afinidade ${index + 1}`).toBe(true);
    });

    [0].forEach((index) => {
      const changed = { ...momentAnswers, [index]: 2 };
      const changedScores = rankMentors(catalogMentors, aptitudeAnswers, changed, 'same');
      expect(changedScores.some((mentor) => mentor.match !== baseScores.get(mentor.id)), `pergunta de momento ${index + 1}`).toBe(true);
    });
  });

  it('faz a resposta de aprofundamento técnico alterar a pontuação conforme o domínio', () => {
    const aiMentor: PublicMentor = {
      ...mentors[0]!,
      id: 'ai-specialist',
      expertise: 'Engenharia de Inteligência Artificial',
      themes: [{ name: 'IA', domains: ['Agentes de IA', 'Workflows', 'Prompt Engineering', 'LLM'] }],
    };
    const matchesMl = rankMentors([aiMentor], {}, { 0: 1, 1: 1, 2: 0 }, 'same')[0]!.match;
    const matchesSdlc = rankMentors([aiMentor], {}, { 0: 1, 1: 1, 2: 2 }, 'same')[0]!.match;
    expect(matchesMl).toBeGreaterThan(matchesSdlc);
  });

  it('ordena a mentora com maior aderência aos temas escolhidos em primeiro lugar', () => {
    const dataMentor = mentors.find((mentor) => mentor.expertise === AREAS.dados)!;
    const productMentor = mentors.find((mentor) => mentor.expertise === AREAS.produto_plataformas)!;
    const ranked = rankMentors(
      [productMentor, dataMentor],
      { 2: 0 },
      {},
      'same',
    );
    expect(ranked[0]?.id).toBe(dataMentor.id);
    expect(ranked[0]?.match).toBeGreaterThan(ranked[1]?.match ?? -1);
  });

  it('respeita os pesos de áreas combinadas e evita falsos matches por trecho de palavra', () => {
    const dataMentor = mentors.find((mentor) => mentor.expertise === AREAS.dados)!;
    const productMentor = mentors.find((mentor) => mentor.expertise === AREAS.produto_plataformas)!;
    const qualityMentor: PublicMentor = {
      ...mentors[0]!,
      id: 'quality-mentor',
      expertise: 'Qualidade de Engenharia de Software',
      themes: [{ name: 'Qualidade de Engenharia de Software', domains: ['Testes Funcionais'] }],
    };
    const ranked = rankMentors([productMentor, qualityMentor, dataMentor], { 3: 0 }, {}, 'same');
    expect(ranked[0]?.id).toBe(dataMentor.id);
    expect(ranked.find((mentor) => mentor.id === qualityMentor.id)?.match).toBe(0);
  });

  it('usa os temas e domínios dos 23 perfis da planilha para ordenar as recomendações', () => {
    const ranked = rankMentors(
      catalogMentors,
      { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 2 },
      { 0: 1, 1: 1, 2: 1 },
      'dados-e-ia',
    );
    const dataSpecialists = new Set([
      'Alice Cruz Magalhães',
      'Amanda Albuquerque',
      'Anny Da Silva Araujo',
      'Bruna Cecilia Pereira Da Costa',
      'France Evellyn Gomes De Oliveira',
      'Gabriela Cavalcanti de Albuquerque',
      'Nicole Charron',
    ]);
    expect(dataSpecialists.has(ranked[0]!.name)).toBe(true);
    expect(ranked[0]!.match).toBe(Math.max(...ranked.map((mentor) => mentor.match)));
  });

  it('aplica a carreira em Y: início mantém todas, técnica e liderança filtram pelos perfis', () => {
    const transition = mentorsForStage(catalogMentors, 'transition');
    const technical = mentorsForStage(catalogMentors, 'technical');
    const leadership = mentorsForStage(catalogMentors, 'leadership');
    expect(transition).toHaveLength(catalogMentors.length);
    expect(technical.length).toBeGreaterThan(0);
    expect(leadership.length).toBeGreaterThan(0);
    expect(technical.length).toBeLessThan(catalogMentors.length);
    expect(leadership.length).toBeLessThan(catalogMentors.length);

    const technicalRanking = rankMentors(catalogMentors, {}, { 0: 1, 1: 0, 2: 2 }, 'technical-branch');
    const leadershipRanking = rankMentors(catalogMentors, {}, { 0: 2, 1: 0, 2: 0 }, 'leadership-branch');
    expect(technicalRanking.every((mentor) => technical.some((eligible) => eligible.id === mentor.id))).toBe(true);
    expect(leadershipRanking.every((mentor) => leadership.some((eligible) => eligible.id === mentor.id))).toBe(true);
    expect(technicalRanking.map((mentor) => mentor.id)).not.toEqual(leadershipRanking.map((mentor) => mentor.id));
  });

  it('refina o grupo técnico pelo tema escolhido sem misturar perfis de outras especialidades', () => {
    const narrowed = mentorsForAnswers(catalogMentors, { 0: 1, 1: 2, 2: 2 });
    const dataNarrowed = mentorsForAnswers(catalogMentors, { 0: 1, 1: 0, 2: 0 });
    expect(narrowed.some((mentor) => mentor.name === 'Beatriz Berto de Matos Benz')).toBe(true);
    expect(narrowed.some((mentor) => mentor.name === 'Alice Cruz Magalhães')).toBe(false);
    expect(narrowed.length).toBeLessThan(mentorsForStage(catalogMentors, 'technical').length);
    expect(narrowed.map((mentor) => mentor.id)).not.toEqual(dataNarrowed.map((mentor) => mentor.id));
  });

  it('mantém o filtro para as recomendações iniciais e permite expandir para todo o catálogo', () => {
    const journeyAnswers = { 0: 1, 1: 2, 2: 2 };
    const recommendations = rankMentors(catalogMentors, {}, journeyAnswers, 'expand-catalog');
    const allMentors = rankMentors(catalogMentors, {}, journeyAnswers, 'expand-catalog', true);
    expect(recommendations.length).toBeLessThan(catalogMentors.length);
    expect(allMentors).toHaveLength(catalogMentors.length);
    const primary = recommendations.slice(0, 3);
    const primaryIds = new Set(primary.map((mentor) => mentor.id));
    const expanded = [...primary, ...allMentors.filter((mentor) => !primaryIds.has(mentor.id))];
    expect(expanded.slice(0, primary.length).map((mentor) => mentor.id)).toEqual(primary.map((mentor) => mentor.id));
    expect(new Set(expanded.map((mentor) => mentor.id)).size).toBe(catalogMentors.length);
  });

  it('distribui recomendações empatadas entre as mentoras, em vez de privilegiar sempre a primeira', () => {
    const identicalMentors = Array.from({ length: 4 }, (_, index) => ({ ...mentors[0]!, id: `identical-${index}` }));
    const firstPlace = new Map(identicalMentors.map((mentor) => [mentor.id, 0]));
    for (let index = 0; index < 4000; index += 1) {
      const ranked = rankMentors(identicalMentors, {}, { 0: 0, 1: 0, 2: 0 }, `seed-${index}`);
      firstPlace.set(ranked[0]!.id, firstPlace.get(ranked[0]!.id)! + 1);
    }
    for (const count of firstPlace.values()) expect(count).toBeGreaterThan(850);
    for (const count of firstPlace.values()) expect(count).toBeLessThan(1150);
  });

  it('mantém mentoras sem horários no ranking e mantém o desempate estável dentro da mesma jornada', () => {
    const candidates = [
      ...mentors,
      { ...mentors[0]!, id: 'sem-horarios', slots: [{ ...mentors[0]!.slots[0]!, available: false }] },
    ];
    const first = rankMentors(candidates, {}, { 0: 0, 1: 5, 2: 0 }, 'mesma-jornada');
    const again = rankMentors(candidates, {}, { 0: 0, 1: 5, 2: 0 }, 'mesma-jornada');
    expect(first.map((mentor) => mentor.id)).toContain('sem-horarios');
    expect(first.find((mentor) => mentor.id === 'sem-horarios')?.slots.some((slot) => slot.available)).toBe(false);
    expect(first.map((mentor) => mentor.id)).toEqual(again.map((mentor) => mentor.id));
  });
});
