import type { E49PublicResponse } from '@tw/shared';
import { getMentorQuestions, QUESTIONS, STAGE_QUESTION, type Answers, type MentorAnswers, type MentoringStage } from './journeyData.js';

export type PublicMentor = E49PublicResponse['items'][number];
export interface MentorMatch extends PublicMentor {
  match: number;
  stage: MentoringStage;
}

const LEADERSHIP_PROFILE_TERMS = [
  'lideranca',
  'gestao',
  'gestor',
  'gestora',
  'manager',
  'tech lead',
  'lider',
  'coordenacao',
  'coordenador',
  'coordenadora',
];

const TECHNICAL_PROFILE_TERMS = [
  'engenharia',
  'desenvolvimento',
  'software',
  'programacao',
  'backend',
  'frontend',
  'dados',
  'ciencia de dados',
  'analytics',
  'inteligencia artificial',
  'ia',
  'machine learning',
  'cloud',
  'infraestrutura',
  'servicenow',
  'plataforma',
  'qualidade',
  'api',
  'sdlc',
  'aiops',
  'observabilidade',
];

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function deterministicTie(seed: string, id: string): number {
  const hashString = (value: string) => {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  let hash = (hashString(seed) ^ Math.imul(hashString(id), 0x9e3779b1)) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function selectedStage(answers: MentorAnswers): MentoringStage {
  return STAGE_QUESTION.opcoes[answers[0] ?? -1]?.stage ?? 'technical';
}

function matchesTerm(profile: string, term: string): boolean {
  const escaped = normalized(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(profile);
}

function profileText(mentor: PublicMentor): string {
  return normalized([
    mentor.expertise,
    ...mentor.themes.flatMap((theme) => [theme.name, ...theme.domains]),
    ...mentor.slots.map((slot) => slot.topic),
  ].join(' '));
}

export function mentorsForStage(mentors: readonly PublicMentor[], stage: MentoringStage): PublicMentor[] {
  if (stage === 'transition') return [...mentors];
  const terms = stage === 'leadership' ? LEADERSHIP_PROFILE_TERMS : TECHNICAL_PROFILE_TERMS;
  return mentors.filter((mentor) => {
    const profile = profileText(mentor);
    return terms.some((term) => matchesTerm(profile, term));
  });
}

export function mentorsForAnswers(mentors: readonly PublicMentor[], mentorAnswers: MentorAnswers): PublicMentor[] {
  const stage = selectedStage(mentorAnswers);
  let candidates = mentorsForStage(mentors, stage);
  const questions = getMentorQuestions(stage, mentorAnswers[1]);

  questions.slice(1).forEach((question, index) => {
    const option = question.opcoes[mentorAnswers[index + 1] ?? -1];
    if (!option) return;
    const narrowed = candidates.filter((mentor) => {
      const profile = profileText(mentor);
      return option.matchTerms.some((term) => matchesTerm(profile, term));
    });
    if (narrowed.length > 0) candidates = narrowed;
  });

  return candidates;
}

function answerFit(mentor: PublicMentor, aptitudeAnswers: Answers, mentorAnswers: MentorAnswers): number {
  const stage = selectedStage(mentorAnswers);
  const mentorQuestions = getMentorQuestions(stage, mentorAnswers[1]);
  const profile = profileText(mentor);
  let matches = 0;
  let answered = 0;
  mentorQuestions.forEach((question, index) => {
    if (index === 0) return;
    const option = question.opcoes[mentorAnswers[index] ?? -1];
    if (!option) return;
    matches += Number(option.matchTerms.some((term) => matchesTerm(profile, term)));
    answered += 1;
  });
  QUESTIONS.forEach((question, index) => {
    const option = question.opcoes[aptitudeAnswers[index] ?? -1];
    if (!option) return;
    matches += Number(option.matchTerms.some((term) => matchesTerm(profile, term)));
    answered += 1;
  });
  return answered ? matches / answered : 0;
}

export function rankMentors(
  mentors: readonly PublicMentor[],
  aptitudeAnswers: Answers,
  mentorAnswers: MentorAnswers,
  tieSeed: string,
  includeOutsideBranch = false,
): MentorMatch[] {
  const stage = selectedStage(mentorAnswers);
  const eligibleMentors = includeOutsideBranch ? [...mentors] : mentorsForAnswers(mentors, mentorAnswers);
  return eligibleMentors
    .map((mentor) => {
      const score = Math.round(100 * answerFit(mentor, aptitudeAnswers, mentorAnswers));
      return { ...mentor, match: score, stage, tie: deterministicTie(tieSeed, mentor.id) };
    })
    .sort((a, b) => b.match - a.match || a.tie - b.tie)
    .map(({ tie: _tie, ...match }) => match);
}
