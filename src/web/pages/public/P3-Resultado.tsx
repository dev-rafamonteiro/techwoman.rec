import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, EmptyState, LinkButton } from '../../ui';
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
        <header className="tw-pub__head"><Brand height={44} /><span /><Link className="tw-pub__back" to="/">Voltar ao início</Link></header>
        <div className="tw-page"><EmptyState title="Você ainda não fez a jornada" text="Responda as perguntas para ver seu resultado." action={<LinkButton to="/jornada">Começar jornada</LinkButton>} /></div>
      </div>
    );
  }
  const second = r.ranking[1]!;
  const nivel = r.nivelDe(top);
  const perfil = PERFIS[r.perfil]!;
  const f = r.tracos.map((t) => TRACOS[t]!.frase);
  const xp = calcXp(answers);

  return (
    <div className="tw-pub tw-p3" data-testid="p3" style={{ minHeight: '100vh' }}>
      <header className="tw-pub__head">
        <Brand height={44} />
        <span className="tw-p3__xp">{xp} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>
      <div className="tw-p3__body">
        <section className="tw-p3__dark" aria-label="Seu resultado">
          <div className="tw-row"><span className="tw-pub__eyebrow" style={{ color: '#ebc2f1' }}>Seu resultado</span><span className="tw-p3__xp" data-testid="p3-xp">{xp} XP conquistados</span></div>
          <span>Você tem aptidão para</span>
          <h1 className="tw-p3__area" data-testid="p3-area">{AREAS[top]}</h1>
          <div className="tw-p3__subs">
            <div className="tw-p3__sub">
              <small>Nível de aptidão</small>
              <div className="tw-row"><span className="tw-p3__level">{nivel}</span>
                <span className="tw-dots" role="img" aria-label={`Nível ${nivel} de 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= nivel ? 'on' : ''} />)}</span><span>de 5</span></div>
            </div>
            <div className="tw-p3__sub">
              <small>Seu perfil</small>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{perfil.nome}</strong>
              <span>{perfil.desc}</span>
            </div>
          </div>
          <p style={{ margin: 0 }}>Você tem aptidão nível {nivel} para {AREAS[top]}, com perfil {perfil.nome}: demonstra {f[0]}, {f[1]} e {f[2]}.</p>
          <div className="tw-row">{r.tracos.map((t) => <span key={t} className="tw-p3__chip">{TRACOS[t]!.chip}</span>)}</div>
          <span>Também combina com você: <strong>{AREAS[second]}</strong></span>
        </section>

        <section className="tw-p3__cta">
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>Inscreva-se na nossa mentoria para te ajudarmos.</h2>
            <p style={{ margin: 0 }}>A área <strong>{AREAS[top]}</strong> já vai preenchida. Uma mentora da área escolhe sua inscrição e propõe horário e mesa; você confirma pelo celular.</p>
          </div>
          <LinkButton to="/mentoria/inscricao" size="lg" className="tw-btn--dark" data-testid="p3-cta">Quero uma mentoria nessa área</LinkButton>
        </section>

        <section className="tw-p3__white">
          <h2 style={{ margin: 0 }}>Suas áreas de afinidade</h2>
          {r.ranking.map((k, idx) => (
            <div key={k}>
              <div className="tw-row" style={{ justifyContent: 'space-between' }}><span>{AREAS[k]}</span><span>nível {r.nivelDe(k)}</span></div>
              <div className="tw-aff__track"><div className={`tw-aff__bar${idx === 0 ? ' tw-aff__bar--1' : ''}`} style={{ width: `${r.pct(k)}%` }} /></div>
            </div>
          ))}
        </section>

        <div className="tw-row">
          <button type="button" className="tw-p3__redo" onClick={() => { saveAnswers(null); navigate('/jornada'); }} data-testid="p3-redo">Refazer a jornada</button>
          <span>A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</span>
        </div>
      </div>
    </div>
  );
}
