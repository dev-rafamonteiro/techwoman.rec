import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, type PublicMentor } from '@tw/shared';
import { Brand, ErrorState, LinkButton, call, useQuery } from '../../ui';
import { filterMentors, resultCountLabel } from './lib/mentoras';
import './public.css';
import './p7.css';

const NO_PHOTO = '/mentoras/sem-foto.png';

/** Foto circular; sem foto (ou se o arquivo falhar) mostra a imagem padrão, sem gravar nada no cadastro. */
function Portrait({ mentor, tone }: { mentor: PublicMentor; tone: number }) {
  const [failed, setFailed] = useState(false);
  const photo = mentor.photoUrl && !failed ? mentor.photoUrl : null;
  return (
    <div className={`tw-p7__portrait tw-p7__portrait--${tone}`}>
      <img src={photo ?? NO_PHOTO} alt={photo ? `Foto de ${mentor.name}` : ''} loading="lazy" decoding="async" width={148} height={148} onError={() => setFailed(true)} />
    </div>
  );
}

function MentorCard({ mentor, tone }: { mentor: PublicMentor; tone: number }) {
  const expertise = mentor.areas.map((a) => a.label).join(' · ');
  return (
    <article className="tw-p7__card" data-testid="p7-card">
      <Portrait mentor={mentor} tone={tone} />
      <div className="tw-p7__card-content">
        <div className="tw-p7__identity">
          {mentor.organization && <span className="tw-p7__org">{mentor.organization}</span>}
          <h3>{mentor.name}</h3>
          {expertise && <p className="tw-p7__expertise">{expertise}</p>}
        </div>
        {mentor.bio && <p className="tw-p7__bio">{mentor.bio}</p>}
        {mentor.themes.length > 0 && (
          <ul className="tw-p7__themes" aria-label="Temas">
            {mentor.themes.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
          </ul>
        )}
        {mentor.linkedin && (
          <a className="tw-p7__linkedin" href={mentor.linkedin} target="_blank" rel="noopener noreferrer">
            <span>Ver perfil no LinkedIn<span className="tw-sr-only"> de {mentor.name}</span></span>
            <span>↗ <span className="tw-p7__new-tab">abre em nova aba</span></span>
          </a>
        )}
      </div>
    </article>
  );
}

/** P7 · As mentoras (E54): perfis públicos das mentoras ativas, com busca sem recarregar. */
export default function P7Mentoras() {
  const q = useQuery((signal) => call(ENDPOINTS.E54, { signal }), []);
  const [query, setQuery] = useState('');
  const mentors = useMemo(() => (q.status === 'success' ? q.data.items : []), [q.status, q.data]);
  const filtered = useMemo(() => filterMentors(mentors, query), [mentors, query]);
  const stats = q.status === 'success' ? q.data.stats : null;
  const num = (n: number | undefined) => (n === undefined ? '—' : n);

  return (
    <div className="tw-pub tw-p7" data-testid="p7">
      <header className="tw-pub__head">
        <Brand height={44} />
        <nav className="tw-pub__nav" aria-label="Seções">
          <a href="/#evento">O evento</a><a href="/#como-funciona">Como funciona</a><a href="/#mentoria">Mentoria</a><a href="/#local">Local</a><Link to="/mentoras" aria-current="page">Mentoras</Link>
        </nav>
        <LinkButton to="/jornada" size="sm">Começar minha jornada</LinkButton>
      </header>

      <main>
        <section className="tw-p7__hero">
          <div className="tw-pub__wrap tw-p7__hero-inner">
            <div className="tw-p7__hero-copy">
              <span className="tw-p7__eyebrow">Mentoria Tech Woman</span>
              <h1>Experiências que abrem caminhos.</h1>
              <p>
                Conheça as profissionais que estão prontas para compartilhar aprendizados, falar sobre suas trajetórias
                e inspirar os seus próximos passos na tecnologia.
              </p>
              <a className="tw-p7__hero-link" href="#mentoras">Conheça as mentoras <span aria-hidden="true">↓</span></a>
            </div>
            <div className="tw-p7__hero-art" aria-hidden="true">
              <span className="tw-p7__orbit tw-p7__orbit--one" />
              <span className="tw-p7__orbit tw-p7__orbit--two" />
              <span className="tw-p7__hero-count">{num(stats?.mentorCount)}<small>{stats?.mentorCount === 1 ? 'mentora' : 'mentoras'}</small></span>
              <span className="tw-p7__hero-spark tw-p7__hero-spark--one">✦</span>
              <span className="tw-p7__hero-spark tw-p7__hero-spark--two">✦</span>
            </div>
          </div>
        </section>

        <section className="tw-p7__intro">
          <div className="tw-pub__wrap">
            <span className="tw-pub__eyebrow">Mentoria no evento</span>
            <h2>Uma conversa pode transformar uma possibilidade em caminho.</h2>
            <div className="tw-p7__intro-bottom">
              <p>
                Conheça quem vai conduzir a conversa e encontre inspiração em histórias reais de quem constrói
                tecnologia todos os dias.
              </p>
              <ul className="tw-p7__facts" aria-label="A mentoria em números">
                <li><strong>{stats ? `${stats.slotMinutes} min` : '—'}</strong> por conversa</li>
                <li><strong>{num(stats?.mentorCount)}</strong> {stats?.mentorCount === 1 ? 'profissional' : 'profissionais'}</li>
                <li><strong>{num(stats?.availableSlots)}</strong> {stats?.availableSlots === 1 ? 'vaga disponível' : 'vagas disponíveis'}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="tw-p7__directory" id="mentoras" aria-labelledby="p7-dir-title">
          <div className="tw-pub__wrap">
            <div className="tw-p7__directory-heading">
              <div>
                <span className="tw-pub__eyebrow">Conheça quem inspira</span>
                <h2 id="p7-dir-title">Nossas mentoras</h2>
              </div>
            </div>
            <div className="tw-p7__filters" role="search">
              <label className="tw-p7__search">
                <span>Busque por nome, especialidade, empresa ou tema</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex.: dados, Java, liderança"
                  autoComplete="off"
                  data-testid="p7-search"
                />
              </label>
              {query && (
                <button className="tw-p7__clear" type="button" onClick={() => setQuery('')}>Limpar busca</button>
              )}
            </div>
            <p className="tw-p7__result-count" aria-live="polite" data-testid="p7-count">
              {q.status === 'success' ? resultCountLabel(filtered.length, mentors.length) : ''}
            </p>

            {q.status === 'loading' && (
              <div className="tw-p7__grid" role="status" aria-label="Carregando mentoras">
                <span className="tw-sr-only">Carregando…</span>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="tw-p7__card tw-p7__card--skeleton" aria-hidden="true">
                    <span className="tw-skeleton" style={{ height: 190, borderRadius: 0 }} />
                    <div className="tw-p7__card-content">
                      <span className="tw-skeleton" style={{ height: 18, width: '40%' }} />
                      <span className="tw-skeleton" style={{ height: 22, width: '75%', marginTop: 12 }} />
                      <span className="tw-skeleton" style={{ height: 60, marginTop: 14 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} title="Não foi possível carregar as mentoras" />}

            {q.status === 'success' && filtered.length > 0 && (
              <div className="tw-p7__grid">
                {filtered.map((m) => <MentorCard key={m.id} mentor={m} tone={(mentors.indexOf(m) % 4) + 1} />)}
              </div>
            )}
            {q.status === 'success' && filtered.length === 0 && (
              <div className="tw-p7__empty" role="status">
                <h3>{mentors.length === 0 ? 'Nenhuma mentora cadastrada ainda' : 'Nenhuma mentora encontrada'}</h3>
                <p>{mentors.length === 0 ? 'As mentoras aparecem aqui assim que forem cadastradas.' : 'Tente outro nome, empresa, área ou tema.'}</p>
                {mentors.length > 0 && <button className="tw-p7__clear" type="button" onClick={() => setQuery('')}>Ver todas as mentoras</button>}
              </div>
            )}
          </div>
        </section>

        <section className="tw-p7__closing">
          <div className="tw-pub__wrap">
            <span className="tw-p7__eyebrow">Seu próximo passo começa aqui</span>
            <h2>Venha trocar, aprender e construir novas possibilidades.</h2>
            <LinkButton to="/jornada" size="lg">Começar minha jornada</LinkButton>
          </div>
        </section>
      </main>

      <footer className="tw-p7__footer">
        <div className="tw-pub__wrap">
          <Brand height={36} />
          <span>© 2026 Tech Woman · Mentoria</span>
          <Link to="/">Voltar ao início</Link>
        </div>
      </footer>
    </div>
  );
}
