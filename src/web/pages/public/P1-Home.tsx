import { Link } from 'react-router-dom';
import { ENDPOINTS, KNOWLEDGE_TRACKS } from '@tw/shared';
import { Brand, CalendarIcon, ClockIcon, ErrorState, HeroMosaic, LinkButton, PeopleIcon, PinFilledIcon, PinIcon, SkeletonList, call, useQuery } from '../../ui';
import './public.css';
import './p1.css';

function longDate(date: string): string {
  const d = new Date(`${date}T12:00:00-03:00`);
  const txt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Recife' }).format(d);
  return `${txt.charAt(0).toUpperCase()}${txt.slice(1)}`;
}

function formatHour(time: string): string {
  const [h, m] = time.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

/** Página oficial do evento (ingresso) e dados fixos do local (UI-SPEC, P1). */
const EVENT_PAGE = 'https://app.jalanlive.com/techwoman26/home';
const ADDRESS = 'Cais Santa Rita, 156 - São José, Recife - PE';
const MAP_URL = 'https://maps.app.goo.gl/zsyZM5VQuJCjp2Yu6';
const SOCIAL = [
  ['Instagram', 'https://www.instagram.com/techwoman.rec/'],
  ['LinkedIn', 'https://www.linkedin.com/company/techwoman'],
  ['YouTube', 'https://www.youtube.com/@techwomanrec'],
] as const;
/** P1 · Home do evento (E01) */
export default function P1Home() {
  const ev = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const eventDate = ev.status === 'success' ? longDate(ev.data.date) : 'Sábado, 14 de novembro de 2026';
  const mentoringStart = ev.status === 'success' ? formatHour(ev.data.startTime) : '10h';
  const mentoringEnd = ev.status === 'success' ? formatHour(ev.data.endTime) : '16h45';
  const where = ev.status === 'success' ? ev.data.location : null;
  const cta = (cls = '') => <LinkButton to="/jornada" size="lg" className={cls} data-testid="p1-cta">Começar minha jornada</LinkButton>;

  return (
    <div className="tw-pub tw-p1" data-testid="p1">
      <header className="tw-pub__head">
        <Brand height={44} />
        <nav className="tw-pub__nav" aria-label="Seções">
          <a href="#evento">O evento</a><a href="#como-funciona">Como funciona</a><a href="#mentoria">Mentoria</a><a href="#local">Local</a><Link to="/mentoras">Mentoras</Link>
        </nav>
        <LinkButton to="/jornada" size="sm">Começar minha jornada</LinkButton>
      </header>

      <section className="tw-p1__hero">
        <div className="tw-pub__wrap">
          <div className="tw-stack">
            <span className="tw-pub__eyebrow">Save the date</span>
            <h1>Conectar mulheres, tecnologia e futuros possíveis.</h1>
            <p className="tw-p1__where" data-testid="p1-when">
              <PinFilledIcon size={18} />
              {eventDate} · Recife
            </p>
            <p>Evento: 8h às 18h<br />Sessões de mentoria: {mentoringStart} às {mentoringEnd}</p>
            <p>O Tech Woman é um movimento que nasceu para ampliar a presença feminina no universo da tecnologia e da inovação, fortalecendo a representatividade, o desenvolvimento profissional e as conexões entre mulheres.</p>
            <div className="tw-row">
              {cta()}
              <a className="tw-btn tw-btn--lg tw-btn--outline" href="#mentoria">Como funciona a mentoria</a>
            </div>
            <a className="tw-p1__ticket" href={EVENT_PAGE} target="_blank" rel="noopener noreferrer" data-testid="p1-ticket">Garanta seu ingresso para o evento ↗</a>
          </div>
          <div className="tw-mosaic" aria-hidden="true"><HeroMosaic /></div>
        </div>
      </section>

      <section id="evento">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-p1__eyebrow">O evento</span>
          {ev.status === 'loading' && <SkeletonList rows={1} height={90} />}
          {ev.status === 'error' && <ErrorState error={ev.error} onRetry={ev.reload} />}
          <div className="tw-p1__cards">
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#f26430' }} aria-hidden="true"><CalendarIcon size={20} color="#3D0A45" /></span><h3>Data</h3><p>{eventDate}</p></div>
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#d98ce6' }} aria-hidden="true"><ClockIcon size={20} color="#3D0A45" /></span><h3>Horário</h3><p>Evento: 8h às 18h<br />Sessões de mentoria: {mentoringStart} às {mentoringEnd}</p></div>
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#8a1f96' }} aria-hidden="true"><PinIcon size={20} color="#FFFFFF" /></span><h3>Onde</h3><p>{where ? `${where} · ` : ''}Recife</p></div>
            <div className="tw-card"><span className="tw-p1__ico" style={{ background: '#d98ce6' }} aria-hidden="true"><PeopleIcon size={20} color="#3D0A45" /></span><h3>Para quem</h3><p>Mulheres que querem entrar ou crescer na área de tecnologia</p></div>
          </div>
          <h3 className="tw-p1__trailstitle">Trilhas de conhecimento</h3>
          <div className="tw-p1__trails" data-testid="p1-trails">
            {KNOWLEDGE_TRACKS.map(({ key, label, description, color }) => (
              <div key={key} className="tw-card tw-p1__trail" style={{ borderTopColor: color }}><h4>{label}</h4><p>{description}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="tw-p1__dark" id="como-funciona">
        <div className="tw-pub__wrap">
          <span className="tw-pub__eyebrow">Como funciona</span>
          <h2>Descubra sua área e ganhe uma mentoria no evento.</h2>
          {[
            ['Descubra sua área', 'Perguntas e desafios rápidos revelam sua aptidão, seu nível e seu perfil.', '#f26430'],
            ['Inscreva-se na mentoria', 'Um formulário curto, com a sua área já preenchida.', '#d98ce6'],
            ['Escolha horário e mentora', 'Veja as vagas da sua trilha e escolha; a mesa é definida automaticamente.', '#c9f4ee'],
          ].map(([t, d, c], i) => (
            <div key={t} className="tw-p1__step"><b style={{ background: c }}>{i + 1}</b><div><strong>{t}</strong><p style={{ margin: '2px 0 0' }}>{d}</p></div></div>
          ))}
          <div className="tw-p1__invite" aria-label="Exemplo de mentoria confirmada">
            <span className="tw-p1__eyebrow">Mentoria confirmada</span>
            <h3 style={{ margin: 0 }}>Mesa 7 · 14h15</h3>
            <p style={{ margin: 0 }}>Com Ana, em Backend. Sessão de 40 minutos, aqui no evento.</p>
          </div>
        </div>
      </section>

      <section className="tw-p1__lilac" id="mentoria">
        <div className="tw-pub__wrap tw-stack">
          <span className="tw-p1__eyebrow">Mentoria</span>
          <h2>Mulheres que já trilharam o caminho, prontas para te ajudar.</h2>
          <p>Depois da jornada, inscreva-se na área que mais combina com você. Escolha o horário e a mentora entre as vagas disponíveis; a mesa é definida automaticamente.</p>
          <div className="tw-p1__cards">
            <div className="tw-card tw-p1__stat"><strong>40 min</strong><b>Por sessão</b><p>Uma conversa individual, em horários fixos ao longo do dia.</p></div>
            <div className="tw-card tw-p1__stat"><strong>Mesas</strong><b>No local do evento</b><p>Você recebe o número da mesa junto com o horário.</p></div>
            <div className="tw-card tw-p1__stat"><strong>Celular</strong><b>Tudo pelo link pessoal</b><p>A confirmação chega por e-mail e você troca o horário por lá, se precisar.</p></div>
          </div>
          <div className="tw-row">{cta('tw-btn--dark')}<LinkButton to="/mentoras" size="lg" variant="secondary" data-testid="p1-mentoras">Conheça as mentoras</LinkButton><span className="tw-pub__muted" style={{ maxWidth: 420 }}>A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</span></div>
        </div>
      </section>

      <section className="tw-p1__local" id="local">
        <div className="tw-pub__wrap">
          <div className="tw-stack">
            <span className="tw-p1__eyebrow">Local</span>
            <h2>{where ?? 'Recife Expo Center'}</h2>
            <p className="tw-p1__where" data-testid="p1-address"><PinFilledIcon size={18} />{ADDRESS}</p>
            <div className="tw-row"><a className="tw-btn tw-btn--lg tw-btn--dark" href={MAP_URL} target="_blank" rel="noopener noreferrer">Ver no mapa</a></div>
          </div>
        </div>
      </section>
      <section>
        <div className="tw-pub__wrap">
          <div className="tw-p1__band">
            <div><p className="tw-p1__quote">Você não precisa trabalhar com tecnologia para fazer parte dessa transformação.</p><h2>Pronta para descobrir sua área?</h2><p style={{ margin: 0 }}>A jornada leva poucos minutos e termina com a sua inscrição na mentoria.</p></div>
            {cta('tw-btn--dark')}
          </div>
        </div>
      </section>

      {/* Quem faz: logos oficiais em off-white (/brand/patrocinadores/), sem link nem filtro; width/height = altura de desktop x proporção do arquivo */}
      <section className="tw-p1__quem" id="quem-faz">
        <div className="tw-pub__wrap">
          <h2>Quem faz o Tech Woman</h2>
          <span className="tw-p1__eyebrow">Realização</span>
          <div className="tw-p1__logos">
            <img className="tw-p1__logo--combogo" src="/brand/patrocinadores/combogo-branco.png" alt="Combogó Eventos" width={278} height={72} />
          </div>
          <hr className="tw-p1__quemsep" />
          <span className="tw-p1__eyebrow">Patrocínio</span>
          <div className="tw-p1__logos">
            <img className="tw-p1__logo--claro" src="/brand/patrocinadores/instituto-claro-branco.png" alt="Instituto Claro" width={197} height={64} />
            <img className="tw-p1__logo--bradesco" src="/brand/patrocinadores/bradesco-branco.png" alt="Bradesco" width={215} height={52} />
            <img className="tw-p1__logo--mongodb" src="/brand/patrocinadores/mongodb-branco.svg" alt="MongoDB" width={188} height={48} />
          </div>
        </div>
      </section>

      <footer className="tw-p1__foot">
        <div className="tw-pub__wrap tw-row" style={{ justifyContent: 'space-between' }}>
          <span>© 2026 Tech Woman · <a href="mailto:contato@techwoman.rec.br">contato@techwoman.rec.br</a></span>
          <span className="tw-row">{SOCIAL.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer">{n}</a>)}</span>
          <span className="tw-row"><a href="#evento">O evento</a><a href="#mentoria">Mentoria</a><Link to="/mentoras">As mentoras</Link><a href="/jornada">Jornada</a><a href="/privacidade">Aviso de privacidade</a></span>
        </div>
      </footer>
    </div>
  );
}
