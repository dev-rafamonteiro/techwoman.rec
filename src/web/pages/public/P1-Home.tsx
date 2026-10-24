import { ENDPOINTS } from '@tw/shared';
import { Brand, ErrorState, LinkButton, SkeletonList, call, useQuery } from '../../ui';
import './public.css';

function longDate(date: string, startTime: string): string {
  const d = new Date(`${date}T12:00:00-03:00`);
  const txt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Recife' }).format(d);
  const [h, m] = startTime.split(':');
  return `${txt.charAt(0).toUpperCase()}${txt.slice(1)}, a partir das ${Number(h)}h${m === '00' ? '' : m}`;
}

const MOSAIC: [string, string, string][] = [
  ['#8a2a94', '#d98ce6', '●'], ['#d98ce6', '#f26430', ''], ['#3d0a45', '#f26430', '✺'],
  ['#3d0a45', '#d98ce6', '♀'], ['#6e1a78', '#fff', '»'], ['#d98ce6', '#3d0a45', '∩'],
  ['#f26430', '#3d0a45', '◗'], ['#c9f4ee', '#3d0a45', '14'], ['#8a2a94', '#f26430', '≋'],
];

/** P1 · Home do evento (E01) */
export default function P1Home() {
  const ev = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const when = ev.status === 'success' ? longDate(ev.data.date, ev.data.startTime) : 'Sábado, 14 de novembro de 2026, a partir das 9h';
  const where = ev.status === 'success' ? ev.data.location : null;
  const cta = (cls = '') => <LinkButton to="/jornada" size="lg" className={cls} data-testid="p1-cta">Começar minha jornada</LinkButton>;

  return (
    <div className="tw-pub tw-p1" data-testid="p1">
      <header className="tw-pub__head">
        <Brand />
        <nav className="tw-pub__nav" aria-label="Seções">
          <a href="#evento">O evento</a><a href="#como-funciona">Como funciona</a><a href="#mentoria">Mentoria</a>
        </nav>
        <LinkButton to="/jornada" size="sm">Começar minha jornada</LinkButton>
      </header>

      <section className="tw-p1__hero">
        <div className="tw-pub__wrap">
          <div className="tw-stack">
            <span className="tw-pub__eyebrow">Save the date</span>
            <h1>Seu lugar na tecnologia começa aqui.</h1>
            <p className="tw-p1__where" data-testid="p1-when">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#f26430"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" /></svg>
              {when} · Recife
            </p>
            <p>Um evento feito por mulheres e para mulheres: conteúdo, conexões e mentoria para você descobrir — ou acelerar — sua carreira em tecnologia.</p>
            <div className="tw-row">
              {cta()}
              <a className="tw-btn tw-btn--lg tw-btn--outline" href="#mentoria">Como funciona a mentoria</a>
            </div>
          </div>
          <div className="tw-mosaic" aria-hidden="true">
            {MOSAIC.map(([bg, fg, g], i) => <span key={i} style={{ background: bg, color: fg }}>{g}</span>)}
          </div>
        </div>
      </section>

      <section id="evento">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-p1__eyebrow">O evento</span>
          {ev.status === 'loading' && <SkeletonList rows={1} height={90} />}
          {ev.status === 'error' && <ErrorState error={ev.error} onRetry={ev.reload} />}
          <div className="tw-p1__cards">
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#f26430' }} aria-hidden="true" /><h3>Quando</h3><p>{when}</p></div>
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#8a1f96' }} aria-hidden="true" /><h3>Onde</h3><p>Recife{where ? ` · ${where}` : ''}</p></div>
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#d98ce6' }} aria-hidden="true" /><h3>Para quem</h3><p>Mulheres que querem entrar ou crescer na área de tecnologia</p></div>
          </div>
        </div>
      </section>

      <section className="tw-p1__dark" id="como-funciona">
        <div className="tw-pub__wrap">
          <div>
            <span className="tw-pub__eyebrow">Como funciona</span>
            <h2>Descubra sua área e ganhe uma mentoria no evento.</h2>
            {[
              ['Descubra sua área', 'Perguntas e desafios rápidos revelam sua aptidão, seu nível e seu perfil.', '#f26430'],
              ['Inscreva-se na mentoria', 'Um formulário curto, com a sua área já preenchida e o período que você prefere.', '#d98ce6'],
              ['Aguarde o convite de uma mentora', 'Ela propõe um horário e uma mesa; você confirma pelo celular.', '#c9f4ee'],
            ].map(([t, d, c], i) => (
              <div key={t} className="tw-p1__step"><b style={{ background: c }}>{i + 1}</b><div><strong>{t}</strong><p style={{ margin: '2px 0 0' }}>{d}</p></div></div>
            ))}
          </div>
          <div className="tw-p1__invite" aria-label="Exemplo de convite">
            <span className="tw-p1__eyebrow">Convite recebido</span>
            <h3 style={{ margin: 0 }}>Mesa 7 · 14h15</h3>
            <p style={{ margin: 0 }}>Ana quer te mentorar em Backend. Sessão de 40 minutos, aqui no evento.</p>
            <div className="tw-row"><span className="tw-badge tw-badge--invited">Horário proposto</span><span className="tw-badge tw-badge--priority">Responda até 14h10</span></div>
            <div className="tw-btnrow" aria-hidden="true"><span className="tw-btn tw-btn--primary">Aceitar</span><span className="tw-btn tw-btn--secondary">Recusar</span></div>
          </div>
        </div>
      </section>

      <section className="tw-p1__lilac" id="mentoria">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-p1__eyebrow">Mentoria</span>
          <h2>Mulheres que já trilharam o caminho, prontas para te ajudar.</h2>
          <p>Depois da jornada, inscreva-se na área que mais combina com você. Uma mentora da área escolhe sua inscrição, propõe um horário e uma mesa, e você confirma pelo celular.</p>
          <div className="tw-p1__cards">
            <div className="tw-card tw-p1__stat"><strong>40 min</strong><b>Por sessão</b><p>Uma conversa individual, em horários fixos ao longo do dia.</p></div>
            <div className="tw-card tw-p1__stat"><strong>Mesas</strong><b>No local do evento</b><p>Você recebe o número da mesa junto com o horário.</p></div>
            <div className="tw-card tw-p1__stat"><strong>Celular</strong><b>Você confirma por lá</b><p>Avisamos por e-mail e WhatsApp quando chegar o convite.</p></div>
          </div>
          <div className="tw-row">{cta('tw-btn--dark')}<span className="tw-pub__muted" style={{ maxWidth: 420 }}>A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</span></div>
        </div>
      </section>

      <section>
        <div className="tw-pub__wrap">
          <div className="tw-p1__band">
            <div><h2>Pronta para descobrir sua área?</h2><p style={{ margin: 0 }}>A jornada leva poucos minutos e termina com a sua inscrição na mentoria.</p></div>
            {cta('tw-btn--dark')}
          </div>
        </div>
      </section>

      <footer className="tw-p1__foot">
        <div className="tw-pub__wrap tw-row" style={{ justifyContent: 'space-between' }}>
          <span>© 2026 Tech Woman</span>
          <span className="tw-row"><a href="#evento">O evento</a><a href="#mentoria">Mentoria</a><a href="/jornada">Jornada</a><a href="/privacidade">Aviso de privacidade</a></span>
        </div>
      </footer>
    </div>
  );
}
