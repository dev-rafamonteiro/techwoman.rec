import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Button } from '../../ui';
import { QUESTIONS, calcXp, saveAnswers, type Answers } from './lib/journeyData';
import './public.css';

/** P2 · Gamificação: intro, 7 etapas de perguntas e desafios com XP. Resultado em P3. */
export default function P2Jornada() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'quiz'>('intro');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const total = QUESTIONS.length;
  const q = QUESTIONS[i]!;
  const sel = answers[i];
  const hasSel = sel != null;
  const progress = Math.round(((i + (hasSel ? 1 : 0)) / total) * 100);
  const right = q.correta != null && sel === q.correta;

  const next = () => {
    if (!hasSel) return;
    if (i >= total - 1) {
      saveAnswers(answers);
      navigate('/jornada/resultado');
    } else setI(i + 1);
  };

  return (
    <div className="tw-pub tw-p3" data-testid="p2" style={{ minHeight: '100vh' }}>
      <header className="tw-pub__head">
        <Brand height={44} />
        <span className="tw-p3__xp" aria-live="polite" data-testid="p2-xp">{calcXp(answers)} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>

      {step === 'intro' ? (
        <main className="tw-p3__body tw-p3__intro" style={{ gap: 20, paddingTop: 48 }}>
          <span className="tw-pub__eyebrow">Gamificação</span>
          <h1>Descubra sua aptidão na tecnologia.</h1>
          <p style={{ margin: 0, maxWidth: 560 }}>Responda algumas perguntas e encare desafios rápidos. No final, você recebe um resumo da sua aptidão e pode se inscrever na mentoria da sua área.</p>
          <div className="tw-p2i">
            <div className="tw-p2i__a"><strong>{total} etapas</strong><span>Perguntas e desafios</span></div>
            <div className="tw-p2i__b"><strong>Aptidão</strong><span>Área, nível e perfil</span></div>
            <div className="tw-p2i__c"><strong>Mentoria</strong><span>Inscreva-se na sua área</span></div>
          </div>
          <div><Button size="lg" onClick={() => setStep('quiz')} data-testid="p2-start">Começar jornada</Button></div>
        </main>
      ) : (
        <main className="tw-p3__body">
          <div className="tw-row" style={{ justifyContent: 'space-between' }}>
            <strong>Etapa {i + 1} de {total}</strong>
            <span className="tw-pub__tag" data-testid="p2-kind">{q.tipo === 'desafio' ? 'Desafio' : 'Pergunta'}</span>
          </div>
          <div className="tw-pub__progress" role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div>
          <section className="tw-p3__white">
            <h2 style={{ margin: 0 }} data-testid="p2-question">{q.texto}</h2>
            <div className="tw-p2__opts" role="group" aria-label="Alternativas">
              {q.opcoes.map((o, k) => (
                <button key={k} type="button" className="tw-opt" aria-pressed={sel === k} data-testid={`p2-opt-${k}`}
                  onClick={() => setAnswers((p) => ({ ...p, [i]: k }))}>
                  <span className="tw-opt__letter" aria-hidden="true">{'ABCD'.charAt(k)}</span><span>{o.label}</span>
                </button>
              ))}
            </div>
            {hasSel && q.correta != null && (
              <div className="tw-card" role="status" data-testid="p2-feedback">
                <strong>{right ? 'Mandou bem! +20 XP de bônus' : `Quase! A resposta certa é ${q.opcoes[q.correta]!.label}.`}</strong>
                <p>{q.explica}</p>
              </div>
            )}
            <div className="tw-row" style={{ justifyContent: 'space-between' }}>
              <Button variant="secondary" onClick={() => (i === 0 ? setStep('intro') : setI(i - 1))} data-testid="p2-back">Voltar</Button>
              <Button disabled={!hasSel} onClick={next} data-testid="p2-next">{i === total - 1 ? 'Ver meu resultado' : 'Próxima'}</Button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
