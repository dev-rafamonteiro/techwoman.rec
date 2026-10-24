import { ENDPOINTS } from '@tw/shared';
import { Brand, ErrorState, LinkButton, SkeletonList, call, useQuery } from '../../ui';
import './public.css';

function longDate(date: string, startTime: string): string {
  const d = new Date(`${date}T12:00:00-03:00`);
  const txt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Recife' }).format(d);
  const [h, m] = startTime.split(':');
  return `${txt.charAt(0).toUpperCase()}${txt.slice(1)}, a partir das ${Number(h)}h${m === '00' ? '' : m}`;
}

/** P1 · Home do evento (E01) */
export default function P1Home() {
  const ev = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const when = ev.status === 'success' ? longDate(ev.data.date, ev.data.startTime) : null;
  const where = ev.status === 'success' ? ev.data.location : null;
  const cta = <LinkButton to="/jornada" size="lg" data-testid="p1-cta">Começar minha jornada</LinkButton>;

  return (
    <div className="tw-pub" data-testid="p1">
      <header className="tw-pub__head">
        <Brand />
        <nav className="tw-pub__nav" aria-label="Seções">
          <a href="#evento">O evento</a><a href="#como-funciona">Como funciona</a><a href="#mentoria">Mentoria</a>
        </nav>
        <LinkButton to="/jornada" size="sm">Começar minha jornada</LinkButton>
      </header>

      <section className="tw-pub__hero">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-pub__eyebrow">Save the date</span>
          <h1>Seu lugar na tecnologia começa aqui.</h1>
          <p data-testid="p1-when">{when ? `${when} · Recife` : 'Sábado, 14 de novembro de 2026 · Recife · a partir das 9h'}</p>
          <p>Um evento feito por mulheres e para mulheres: conteúdo, conexões e mentoria para você descobrir — ou acelerar — sua carreira em tecnologia.</p>
          <div>{cta}</div>
        </div>
      </section>

      <section className="tw-pub__section" id="evento">
        <div className="tw-pub__wrap">
          <h2>O evento</h2>
          {ev.status === 'loading' && <SkeletonList rows={2} height={48} />}
          {ev.status === 'error' && <ErrorState error={ev.error} onRetry={ev.reload} />}
          <div className="tw-pub__grid tw-pub__grid--3">
            <div className="tw-card"><h3>Quando</h3><p>{when ?? 'Sábado, 14 de novembro de 2026, a partir das 9h'}</p></div>
            <div className="tw-card"><h3>Onde</h3><p>Recife{where ? ` · ${where}` : ''}</p></div>
            <div className="tw-card"><h3>Para quem</h3><p>Mulheres que querem entrar ou crescer na área de tecnologia</p></div>
          </div>
        </div>
      </section>

      <section className="tw-pub__section tw-pub__section--white" id="como-funciona">
        <div className="tw-pub__wrap">
          <h2>Como funciona</h2>
          <p className="tw-pub__muted">Descubra sua área e ganhe uma mentoria no evento.</p>
          <ol className="tw-pub__grid tw-pub__grid--3" style={{ listStyle: 'none', padding: 0 }}>
            {[
              ['Descubra sua área', 'Perguntas e desafios rápidos revelam sua aptidão, seu nível e seu perfil.'],
              ['Inscreva-se na mentoria', 'Um formulário curto, com a sua área já preenchida e o período que você prefere.'],
              ['Aguarde o convite de uma mentora', 'Ela propõe um horário e uma mesa; você confirma pelo celular.'],
            ].map(([t, d], i) => (
              <li key={t} className="tw-card tw-stack"><span className="tw-pub__num" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tw-pub__section" id="mentoria">
        <div className="tw-pub__wrap tw-pub__grid tw-pub__grid--2">
          <div className="tw-stack">
            <h2>Mulheres que já trilharam o caminho, prontas para te ajudar.</h2>
            <p>Depois da jornada, inscreva-se na área que mais combina com você. Uma mentora da área escolhe sua inscrição, propõe um horário e uma mesa, e você confirma pelo celular.</p>
            <div className="tw-pub__grid tw-pub__grid--3">
              <div className="tw-card"><strong>40 min</strong><p>Por sessão. Uma conversa individual, em horários fixos ao longo do dia.</p></div>
              <div className="tw-card"><strong>Mesas</strong><p>No local do evento. Você recebe o número da mesa junto com o horário.</p></div>
              <div className="tw-card"><strong>Celular</strong><p>Você confirma por lá. Avisamos por e-mail e WhatsApp quando chegar o convite.</p></div>
            </div>
            <div>{cta}</div>
            <p className="tw-pub__muted">A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</p>
          </div>
          <div className="tw-card tw-card--accent tw-stack" aria-label="Exemplo de convite">
            <span className="tw-pub__tag">Convite recebido</span>
            <h3>Mesa 7 · 14h15</h3>
            <p>Ana quer te mentorar em Backend. Sessão de 40 minutos, aqui no evento.</p>
            <p><strong>Horário proposto</strong> · Responda até 14h10</p>
            <div className="tw-row" aria-hidden="true"><span className="tw-btn tw-btn--mint">Aceitar</span><span className="tw-btn tw-btn--secondary">Recusar</span></div>
          </div>
        </div>
      </section>

      <section className="tw-pub__hero">
        <div className="tw-pub__wrap tw-stack">
          <h2>Pronta para descobrir sua área?</h2>
          <p>A jornada leva poucos minutos e termina com a sua inscrição na mentoria.</p>
          <div>{cta}</div>
        </div>
      </section>

      <footer className="tw-pub__section tw-pub__muted">
        <div className="tw-pub__wrap tw-row">
          <span>© 2026 Tech Woman</span>
          <a href="#evento">O evento</a><a href="#mentoria">Mentoria</a><a href="/jornada">Jornada</a><a href="/privacidade">Aviso de privacidade</a>
        </div>
      </footer>
    </div>
  );
}
