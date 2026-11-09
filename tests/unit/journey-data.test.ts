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

  it('mantém as pontuações de área usadas pela inscrição', () => {
    const result = computeResult({ 0: 0 });

    expect(result.score.dados).toBe(3);
    expect(result.trackScores.dados).toBe(3);
    expect(result.trackRanking[0]).toBe('dados');
  });

  it('não usa o desafio de lógica para pontuar afinidade com uma trilha', () => {
    const challengeIndex = QUESTIONS.findIndex((question) => question.correta != null);
    const result = computeResult({ [challengeIndex]: QUESTIONS[challengeIndex]!.correta! });

    expect(Object.values(result.trackScores).every((score) => score === 0)).toBe(true);
    expect(new Set(KNOWLEDGE_TRACKS.map(({ key }) => result.trackPct(key)))).toEqual(new Set([6]));
  });
});
