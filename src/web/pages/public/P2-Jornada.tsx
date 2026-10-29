import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Button } from '../../ui';
import { getMentorQuestions, MENTOR_QUESTION_COUNT, QUESTIONS, STAGE_QUESTION, calcXp, saveAnswers, saveMentorJourney, type Answers, type MentorAnswers } from './lib/journeyData';
import './public.css';

/** P2 · Questionário de afinidade e momento profissional; recomendações em P3. */
export default function P2Jornada() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'moment' | 'affinity'>('intro');
  const [i, setI] = useState(0);
  const [mentorI, setMentorI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [mentorAnswers, setMentorAnswers] = useState<MentorAnswers>({});
  const total = QUESTIONS.length + MENTOR_QUESTION_COUNT;
  const stage = STAGE_QUESTION.opcoes[mentorAnswers[0] ?? -1]?.stage ?? null;
  const q = step === 'moment' ? getMentorQuestions(stage, mentorAnswers[1])[mentorI] ?? STAGE_QUESTION : QUESTIONS[i]!;
  const sel = step === 'moment' ? mentorAnswers[mentorI] : answers[i];
  const hasSel = sel != null;
  const completed = step === 'moment' ? mentorI + (hasSel ? 1 : 0) : MENTOR_QUESTION_COUNT + i + (hasSel ? 1 : 0);
  const progress = Math.round((completed / total) * 100);
  const next = () => {
    if (!hasSel) return;
    if (step === 'moment' && mentorI >= MENTOR_QUESTION_COUNT - 1) {
      setStep('affinity');
      setI(0);
    } else if (step === 'affinity' && i >= QUESTIONS.length - 1) {
      saveAnswers(answers);
      saveMentorJourney(mentorAnswers);
      navigate('/jornada/resultado');
    } else if (step === 'moment') setMentorI(mentorI + 1);
    else if (step === 'affinity') setI(i + 1);
  };

  const back = () => {
    if (step === 'affinity' && i === 0) {
      setStep('moment');
      setMentorI(MENTOR_QUESTION_COUNT - 1);
    } else if (step === 'affinity') setI(i - 1);
    else if (step === 'moment' && mentorI === 0) setStep('intro');
    else if (step === 'moment') setMentorI(mentorI - 1);
  };

  return (
    <div className="tw-pub tw-p3" data-testid="p2" style={{ minHeight: '100vh' }}>
      <header className="tw-pub__head">
        <Brand height={44} />
        <span className="tw-p3__xp" aria-live="polite" data-testid="p2-xp">{calcXp(answers, mentorAnswers)} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>

      {step === 'intro' ? (
        <main className="tw-p3__body tw-p3__intro" style={{ gap: 20, paddingTop: 48 }}>
          <span className="tw-pub__eyebrow">Gamificação</span>
          <h1>Descubra suas afinidades na tecnologia.</h1>
          <p style={{ margin: 0, maxWidth: 560 }}>Comece contando em que momento profissional você está. Se está começando, todas as mentoras podem ser consideradas; se busca especialização técnica ou liderança, a jornada prioriza mentoras dessa trilha e aprofunda os temas escolhidos. Cada resposta soma XP e ajuda a encontrar as mentoras mais alinhadas a você.</p>
          <div className="tw-p2i">
            <div className="tw-p2i__a"><strong>{total} perguntas</strong><span>Interesses e momento profissional</span></div>
            <div className="tw-p2i__b"><strong>Match</strong><span>3 mentoras recomendadas</span></div>
            <div className="tw-p2i__c"><strong>Reserva</strong><span>Escolha mentora e horário</span></div>
          </div>
          <div><Button size="lg" onClick={() => setStep('moment')} data-testid="p2-start">Começar jornada</Button></div>
        </main>
      ) : (
        <main className="tw-p3__body">
          <div className="tw-row" style={{ justifyContent: 'space-between' }}>
            <strong>Etapa {completed - (hasSel ? 1 : 0) + 1} de {total}</strong>
            <span className="tw-pub__tag" data-testid="p2-kind">
              {step === 'moment' ? 'Momento profissional' : 'Afinidade e interesses'}
            </span>
          </div>
          <div className="tw-pub__progress" role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div>
          <section className="tw-p3__white">
            <h2 style={{ margin: 0 }} data-testid="p2-question">{q.texto}</h2>
            <div className="tw-p2__opts" role="group" aria-label="Alternativas">
              {q.opcoes.map((o, k) => (
                <button key={k} type="button" className="tw-opt" aria-pressed={sel === k} data-testid={`p2-opt-${k}`}
                  onClick={() => {
                    if (step === 'moment') {
                      setMentorAnswers((previous) => {
                        if (mentorI === 0) return { 0: k };
                        const nextAnswers = { ...previous };
                        if (mentorI === 1) delete nextAnswers[2];
                        nextAnswers[mentorI] = k;
                        return nextAnswers;
                      });
                    } else {
                      setAnswers((previous) => ({ ...previous, [i]: k }));
                    }
                  }}>
                  <span className="tw-opt__letter" aria-hidden="true">{String.fromCharCode(65 + k)}</span><span>{o.label}</span>
                </button>
              ))}
            </div>
            <div className="tw-row" style={{ justifyContent: 'space-between' }}>
              <Button variant="secondary" onClick={back} data-testid="p2-back">Voltar</Button>
              <Button disabled={!hasSel} onClick={next} data-testid="p2-next">{step === 'affinity' && i === QUESTIONS.length - 1 ? 'Ver meu resultado' : 'Próxima'}</Button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
