import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Button, EmptyState, LinkButton } from '../../ui';
import { saveJourney } from './lib/journey';
import { AREAS, PERFIS, TRACOS, calcXp, computeResult, loadAnswers, saveAnswers } from './lib/journeyData';
import './public.css';

/** P3 · Resultado da gamificação. Grava {area, scores} para P4 pré-preencher a inscrição. */
export default function P3Resultado() {
  const navigate = useNavigate();
  const answers = useMemo(() => loadAnswers(), []);
  const r = useMemo(() => (answers ? computeResult(answers) : null), [answers]);
  const top = r?.ranking[0];

  useEffect(() => {
    if (r && top) saveJourney({ area: top, scores: r.score });
  }, [r, top]);

  if (!answers || !r || !top) {
    return (
      <div className="tw-pub">
        <header className="tw-pub__head"><Brand /><span /><Link className="tw-pub__back" to="/">Voltar ao início</Link></header>
        <div className="tw-page"><EmptyState title="Você ainda não fez a jornada" text="Responda as perguntas para ver seu resultado." action={<LinkButton to="/jornada">Começar jornada</LinkButton>} /></div>
      </div>
    );
  }
  const second = r.ranking[1]!;
  const nivel = r.nivelDe(top);
  const perfil = PERFIS[r.perfil]!;
  const f = r.tracos.map((t) => TRACOS[t]!.frase);

  return (
    <div className="tw-pub" data-testid="p3">
      <header className="tw-pub__head">
        <Brand />
        <span className="tw-pub__xp">{calcXp(answers)} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>
      <section className="tw-pub__hero">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-pub__eyebrow">Seu resultado</span>
          <h1><span data-testid="p3-xp">{calcXp(answers)}</span> XP conquistados</h1>
          <p>Você tem aptidão para</p>
          <h2 style={{ color: '#fff' }} data-testid="p3-area">{AREAS[top]}</h2>
        </div>
      </section>
      <section className="tw-pub__section">
        <div className="tw-pub__wrap tw-pub__grid tw-pub__grid--2">
          <div className="tw-card tw-stack">
            <h3>Nível de aptidão</h3>
            <div className="tw-dots" role="img" aria-label={`Nível ${nivel} de 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= nivel ? 'on' : ''} />)}</div>
            <p>{nivel} de 5</p>
            <h3>Seu perfil</h3>
            <p><strong>{perfil.nome}</strong></p>
            <p>{perfil.desc}</p>
            <p>Você tem aptidão nível {nivel} para {AREAS[top]}, com perfil {perfil.nome}: demonstra {f[0]}, {f[1]} e {f[2]}.</p>
            <div className="tw-row">{r.tracos.map((t) => <span key={t} className="tw-pub__tag">{TRACOS[t]!.chip}</span>)}</div>
            <p>Também combina com você: <strong>{AREAS[second]}</strong></p>
          </div>
          <div className="tw-card tw-card--accent tw-stack">
            <h3>Inscreva-se na nossa mentoria para te ajudarmos.</h3>
            <p>A área <strong>{AREAS[top]}</strong> já vai preenchida. Uma mentora da área escolhe sua inscrição e propõe horário e mesa; você confirma pelo celular.</p>
            <LinkButton to="/mentoria/inscricao" size="lg" block data-testid="p3-cta">Quero uma mentoria nessa área</LinkButton>
            <Button variant="ghost" block onClick={() => { saveAnswers(null); navigate('/jornada'); }} data-testid="p3-redo">Refazer a jornada</Button>
            <p className="tw-pub__muted">A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</p>
          </div>
        </div>
      </section>
      <section className="tw-pub__section tw-pub__section--white">
        <div className="tw-pub__wrap tw-stack">
          <h2>Suas áreas de afinidade</h2>
          {r.ranking.map((k, idx) => (
            <div key={k}>
              <div className="tw-row" style={{ justifyContent: 'space-between' }}><strong>{AREAS[k]}</strong><span>nível {r.nivelDe(k)}</span></div>
              <div className="tw-aff__track"><div className={`tw-aff__bar${idx === 0 ? ' tw-aff__bar--1' : ''}`} style={{ width: `${r.pct(k)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
