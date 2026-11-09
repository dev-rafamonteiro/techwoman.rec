import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_TRACKS } from '../../src/shared/trilhas.js';
import { computeResult, QUESTIONS } from '../../src/web/pages/public/lib/journeyData.js';

describe('resultado da jornada por trilha', () => {
  it('associa as respostas de afinidade a trilhas cadastradas', () => {
    const trackKeys = new Set<string>(KNOWLEDGE_TRACKS.map(({ key }) => key));

    expect(QUESTIONS.every((question) => question.opcoes.every((option) => (
      Object.keys(option.trilhas).every((key) => trackKeys.has(key))
    )))).toBe(true);
  });

  it('oferece o mesmo número de alternativas de afinidade para cada trilha', () => {
    const affinityQuestions = QUESTIONS.filter((question) => question.correta == null);

    KNOWLEDGE_TRACKS.forEach((track) => {
      const options = affinityQuestions.flatMap((question) => question.opcoes)
        .filter((option) => (option.trilhas[track.key] ?? 0) > 0);

      expect(options).toHaveLength(3);
    });
  });

  it.each(KNOWLEDGE_TRACKS)('pode recomendar a trilha $label', (track) => {
    const questionIndex = QUESTIONS.findIndex((question) => (
      question.opcoes.some((option) => (option.trilhas[track.key] ?? 0) > 0)
    ));
    const optionIndex = QUESTIONS[questionIndex]!.opcoes.findIndex((option) => (option.trilhas[track.key] ?? 0) > 0);

    expect(computeResult({ [questionIndex]: optionIndex }).trackRanking[0]).toBe(track.key);
  });

  it('pontua a trilha que vai preenchida na inscrição', () => {
    const result = computeResult({ 0: 0 });

    expect(result.trackScores.dados).toBe(3);
    expect(result.trackRanking[0]).toBe('dados');
  });

  it('distribui o resultado entre as oito trilhas, sem favorecer a ordem da lista', () => {
    const affinity = QUESTIONS.flatMap((question, idx) => (question.correta == null ? [{ idx, total: question.opcoes.length }] : []));
    const wins = new Map<string, number>(KNOWLEDGE_TRACKS.map(({ key }) => [key, 0]));
    let combinations = 0;
    const answers: Record<number, number> = {};
    const walk = (depth: number) => {
      if (depth === affinity.length) {
        const top = computeResult(answers).trackRanking[0]!;
        wins.set(top, wins.get(top)! + 1);
        combinations += 1;
        return;
      }
      for (let option = 0; option < affinity[depth]!.total; option++) {
        answers[affinity[depth]!.idx] = option;
        walk(depth + 1);
      }
    };
    walk(0);

    for (const [, n] of wins) {
      expect(n / combinations).toBeGreaterThan(0.10);
      expect(n / combinations).toBeLessThan(0.15);
    }
  });

  it('dá o mesmo resultado para as mesmas respostas e o desafio de lógica não muda o desempate', () => {
    const challenge = QUESTIONS.findIndex((question) => question.correta != null);
    const tied = { 0: 0, 2: 0 };
    const ranking = computeResult(tied).trackRanking;

    expect(computeResult(tied).trackRanking).toEqual(ranking);
    expect(computeResult({ ...tied, [challenge]: 1 }).trackRanking).toEqual(ranking);
  });

  it('não usa o desafio de lógica para pontuar afinidade com uma trilha', () => {
    const challengeIndex = QUESTIONS.findIndex((question) => question.correta != null);
    const result = computeResult({ [challengeIndex]: QUESTIONS[challengeIndex]!.correta! });

    expect(Object.values(result.trackScores).every((score) => score === 0)).toBe(true);
    expect(new Set(KNOWLEDGE_TRACKS.map(({ key }) => result.trackPct(key)))).toEqual(new Set([6]));
  });
});
