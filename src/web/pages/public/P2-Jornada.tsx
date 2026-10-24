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
    <div className="tw-pub" data-testid="p2">
      <header className="tw-pub__head">
        <Brand />
        <span className="tw-pub__xp" aria-live="polite" data-testid="p2-xp">{calcXp(answers)} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>

      {step === 'intro' ? (
        <section className="tw-pub__hero" style={{ minHeight: '70vh' }}>
          <div className="tw-pub__wrap tw-stack">
            <span className="tw-pub__eyebrow">Gamificação</span>
            <h1>Descubra sua aptidão na tecnologia.</h1>
            <p>Responda algumas perguntas e encare desafios rápidos. No final, você recebe um resumo da sua aptidão e pode se inscrever na mentoria da sua área.</p>
            <div className="tw-pub__grid tw-pub__grid--3">
              <div className="tw-card"><strong>{total} etapas</strong><p>Perguntas e desafios</p></div>
              <div className="tw-card"><strong>Aptidão</strong><p>Área, nível e perfil</p></div>
              <div className="tw-card"><strong>Mentoria</strong><p>Inscreva-se na sua área</p></div>
            </div>
            <div><Button size="lg" onClick={() => setStep('quiz')} data-testid="p2-start">Começar jornada</Button></div>
          </div>
        </section>
      ) : (
        <main className="tw-pub__section">
          <div className="tw-pub__wrap tw-stack" style={{ maxWidth: 720 }}>
            <div className="tw-pub__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div>
            <p className="tw-pub__muted">Etapa {i + 1} de {total} · <span className="tw-pub__tag" data-testid="p2-kind">{q.tipo === 'desafio' ? 'Desafio' : 'Pergunta'}</span></p>
            <h2 data-testid="p2-question">{q.texto}</h2>
            <div className="tw-stack" role="group" aria-label="Alternativas">
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
            <div className="tw-row">
              <Button variant="secondary" onClick={() => (i === 0 ? setStep('intro') : setI(i - 1))} data-testid="p2-back">Voltar</Button>
              <Button disabled={!hasSel} onClick={next} data-testid="p2-next">{i === total - 1 ? 'Ver meu resultado' : 'Próxima'}</Button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
