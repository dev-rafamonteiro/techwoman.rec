import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, type E49PublicResponse } from '@tw/shared';
import { Brand, LinkButton, SkeletonList, call, useQuery } from '../../ui';
import './public.css';
import './p7.css';

interface MentorSlot {
  time: string;
  topic: string;
}

interface Mentor {
  name: string;
  expertise: string;
  city: string;
  linkedin: string;
  bio: string;
  slots: MentorSlot[];
}

type DirectoryMentor = E49PublicResponse['items'][number];

const legacyMentors: Mentor[] = [
  {
    name: 'Adriana Ribeiro, M.Sc',
    expertise: 'Gestão e dados',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/adriana-ribeiro-m-sc-58454a1a/',
    bio: 'Data Engineering Manager no Bradesco, conecta engenharia de dados, liderança e gestão para apoiar o desenvolvimento de pessoas e soluções.',
    slots: [
      { time: '10h–10h45', topic: 'Gestão' },
      { time: '10h45–11h30', topic: 'Gestão' },
    ],
  },
  {
    name: 'Alice Cruz',
    expertise: 'Engenharia de dados',
    city: 'Curitiba',
    linkedin: 'https://www.linkedin.com/in/alice-cruzz/',
    bio: 'Data Engineer no Bradesco, trabalha com Python, SQL e Databricks. Sua trajetória também passa pela educação e pelo ensino de matemática.',
    slots: [
      { time: '10h–10h45', topic: 'Engenharia de Dados' },
      { time: '10h45–11h30', topic: 'Transição da educação para TI' },
    ],
  },
  {
    name: 'Amanda Melo',
    expertise: 'Engenharia de dados e migração de Full Stack para dados',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/amanda-melo-6b00b31b3/',
    bio: 'Data Engineer no Bradesco, com certificações Azure e Databricks e experiência com Airflow. Começou sua carreira em tecnologia no desenvolvimento Full Stack.',
    slots: [
      { time: '10h–10h45', topic: 'Transição de carreira para TI' },
      { time: '10h45–11h30', topic: 'Engenharia de Dados' },
    ],
  },
  {
    name: 'Analu Pucca',
    expertise: 'Produtos digitais e carreira',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/analupuccar/',
    bio: 'Head de Produtos e Plataformas no Bradesco Experience, com mais de nove anos de carreira em Produtos e interesse por cultura organizacional.',
    slots: [
      { time: '10h–10h45', topic: 'Produtos digitais' },
      { time: '10h45–11h30', topic: 'Carreira' },
      { time: '16h–16h45', topic: 'Produtos digitais' },
    ],
  },
  {
    name: 'Ana Vitória de Souza Cruz',
    expertise: 'Engenharia de dados e transição de carreira',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/anavitoriacruz',
    bio: 'Data Engineer no Bradesco, com certificações Azure e AWS. Compartilha experiências em engenharia de dados e transição da carreira acadêmica para tecnologia.',
    slots: [
      { time: '10h–10h45', topic: 'Engenharia de Dados' },
      { time: '10h45–11h30', topic: 'Transição da carreira acadêmica para TI' },
    ],
  },
  {
    name: 'Andreyna Sena',
    expertise: 'Engenharia de dados e transição de carreira',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/andreyna-sena-054569106/',
    bio: 'Data Engineer com experiência em Azure e Databricks, mestrado pela UFPE e pós-graduação em Gestão de Projetos. Também fez transição de carreira para tecnologia.',
    slots: [
      { time: '10h–10h45', topic: 'Transição de carreira para TI' },
      { time: '10h45–11h30', topic: 'Engenharia de Dados' },
    ],
  },
  {
    name: 'Anny Araujo',
    expertise: 'IA e BIA Tech AgentiX',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/annyaraujo/',
    bio: 'Software Engineer no Bradesco, atua com Python, Django, FastAPI e IA. Une conhecimento técnico, visão de produto e comunicação para tornar soluções complexas mais acessíveis.',
    slots: [
      { time: '14h30–15h15', topic: 'Transição da carreira acadêmica para TI' },
      { time: '15h15–16h', topic: 'Agentes de IA e multiagentes' },
    ],
  },
  {
    name: 'Beatriz Benz',
    expertise: 'Qualidade e governança em Engenharia de Plataformas',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/beatriz-benz/',
        bio: 'Engenheira de Software (UTFPR) com trajetória de QA a QA Lead, hoje no CoE de Engenharia de Plataformas. Atua em parceria com infraestrutura, arquitetura e governança para definir e disseminar boas práticas. Pós‑graduanda em IA para Negócios (FIAP).',
    slots: [
      { time: '14h30–15h15', topic: 'CoE de Engenharia de Plataformas: Como padronizar boas práticas em escala' },
      { time: '15h15–16h', topic: 'QA além dos testes: Estratégia, automação e liderança' },
    ],
  },
  {
    name: 'Gabriela Cavalcanti de Albuquerque',
    expertise: 'Engenharia de dados e transição de carreira',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/gabriela-cdeallbuquerque/',
    bio: 'Data Engineer na área de Inteligência de Dados do Bradesco, compartilha sua trajetória e experiências em engenharia de dados.',
    slots: [
      { time: '15h15–16h', topic: 'Transição de antropologia e ciências sociais para TI' },
      { time: '16h–16h45', topic: 'Engenharia de Dados' },
    ],
  },
  {
    name: 'Geovana Santana',
    expertise: 'Engenharia de software',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/geovana-maria/',
    bio: 'Software Engineer no Bradesco, trabalha com desenvolvimento Full Stack, Java, Spring Boot, Angular e Kafka; também possui certificações Azure.',
    slots: [
      { time: '10h–10h45', topic: 'O caminho de uma mulher na carreira de desenvolvimento' },
      { time: '10h45–11h30', topic: 'Desenvolvimento Full Stack' },
    ],
  },
  {
    name: 'Joelma Mayara da Silva',
    expertise: 'Dados e engenharia de dados',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/joelma-mayara-da-silva-34049814a/',
    bio: 'Engenheira e Cientista de Dados, compartilha experiências práticas com dados e caminhos para desenvolver uma carreira na área.',
    slots: [
      { time: '14h30–15h15', topic: 'Desenvolvimento Full Stack' },
      { time: '15h15–16h', topic: 'Transição da carreira acadêmica para TI' },
    ],
  },
  {
    name: 'Júlia Sobral M.',
    expertise: 'Desenvolvimento Java',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/j%C3%BAlia-sobral-m-369137215/',
    bio: 'Software Engineer no Bradesco, atua com Java e Spring e possui certificação Azure. Sua trajetória inclui uma transição de carreira para tecnologia.',
    slots: [
      { time: '15h15–16h', topic: 'Engenharia Backend' },
      { time: '16h–16h45', topic: 'Transição de carreira para TI' },
    ],
  },
  {
    name: 'Mariana Paulina Silva',
    expertise: 'Desenvolvimento Java',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/mariana-paulina-silva-449b0466/',
    bio: 'Engenheira de Software e líder técnica no Bradesco, combina desenvolvimento Java e liderança com uma trajetória de transição de carreira.',
    slots: [
      { time: '14h30–15h15', topic: 'Tech Lead' },
      { time: '15h15–16h', topic: 'Transição de carreira' },
    ],
  },
  {
    name: 'Nicole Charron',
    expertise: 'Dados, engenharia e ciência',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/nicole-charron',
    bio: 'Data Engineer no Bradesco, trabalha com Spark, SQL, Big Data e Python. É formada em Engenharia Biomédica e mestranda em Ciência da Computação.',
    slots: [
      { time: '14h30–15h15', topic: 'Engenharia de Dados' },
      { time: '15h15–16h', topic: 'Transição da carreira acadêmica para TI' },
    ],
  },
  {
    name: 'Rafaela Monteiro',
    expertise: 'Tech Lead e Backend Java',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/rafaela-monteiro-ti/',
    bio: 'Analista sênior de TI e desenvolvedora backend, com foco em Java. Possui certificações AWS Practitioner e AZ-900 e compartilha sua experiência em liderança técnica.',
    slots: [
      { time: '15h15–16h', topic: 'Liderança técnica' },
      { time: '16h–16h45', topic: 'Desenvolvimento Backend Java' },
    ],
  },
  {
    name: 'Rayza Wilma',
    expertise: 'Engenharia e arquitetura de dados',
    city: 'Recife',
    linkedin: 'https://br.linkedin.com/in/rayzawilma',
    bio: 'Senior Data Engineer e Tech Lead no Bradesco, trabalha com SQL, Python, PySpark, Databricks e Azure no desenvolvimento de produtos de dados escaláveis.',
    slots: [
      { time: '14h30–15h15', topic: 'Soft skills' },
      { time: '16h–16h45', topic: 'Engenharia de Dados' },
    ],
  },
  {
    name: 'Sandra Mota',
    expertise: 'Gestão, produtos digitais e plataformas de APIs',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/santina-mota/',
    bio: 'Product Leader com mais de 20 anos em tecnologia, atua com produtos de plataformas, APIs e ecossistemas digitais, estratégia e transformação.',
    slots: [
      { time: '14h30–15h15', topic: 'Transição da carreira acadêmica para TI' },
      { time: '16h–16h45', topic: 'Liderança e gestão' },
    ],
  },
  {
    name: 'Sayumi Morimoto',
    expertise: 'ServiceDesk e desenvolvimento de plataformas',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/sayumi-morimoto/',
    bio: 'Gerente de Sistemas no Bradesco, com experiência em ServiceNow, Microsoft Intune, SCCM, Active Directory e gestão de serviços de TI.',
    slots: [
      { time: '10h–10h45', topic: 'Desenvolvimento ServiceNow' },
      { time: '10h45–11h30', topic: 'Infraestrutura: Domain Controller on-premises e híbrido' },
      { time: '16h–16h45', topic: 'Desenvolvimento ServiceNow' },
    ],
  },
  {
    name: 'Stephanie Lima Nascimento',
    expertise: 'Gestão',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/slnascimento/',
    bio: 'Senior Engineering Manager com atuação em engenharia mobile, experiência do cliente e canais de comunicação, além de experiência em liderança e transformação digital.',
    slots: [
      { time: '10h–10h45', topic: 'Liderança e gestão' },
      { time: '10h45–11h30', topic: 'Metodologia ágil' },
      { time: '14h30–15h15', topic: 'Metodologia ágil' },
    ],
  },
  {
    name: 'Tatiana Gomes de Farias',
    expertise: 'IA e BIA Tech SDLC',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/tatiana-gomes-de-farias/',
    bio: 'Tech Manager em IA e líder de Engenharia de Plataformas, com atuação em AIOps, IA generativa, cibersegurança, infraestrutura e arquitetura.',
    slots: [
      { time: '10h–10h45', topic: 'Ciclo de desenvolvimento com IA' },
      { time: '10h45–11h30', topic: 'AIOps e observabilidade inteligente' },
      { time: '14h30–15h15', topic: 'AIOps e observabilidade inteligente' },
    ],
  },
  {
    name: 'Tatiana Tomé',
    expertise: 'Gestão e desenvolvimento de projetos de TI',
    city: 'São Paulo',
    linkedin: 'https://www.linkedin.com/in/tatiana-tom%C3%A9-07452a10/',
    bio: 'Software Engineer Manager no Bradesco, compartilha experiências em liderança, gestão de projetos de TI para negócios e transição da carreira técnica para gestão.',
    slots: [
      { time: '15h15–16h', topic: 'Liderança e gestão' },
      { time: '16h–16h45', topic: 'Transição de carreira técnica para gestão e liderança em TI' },
    ],
  },
  {
    name: 'Bruna Costa',
    expertise: 'Ciência de dados e gestão',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/bruna-costa-432370139/',
    bio: 'Data Science Tech Manager, conecta dados, analytics e inteligência artificial aplicada a negócios. Tem formação em Estatística e Tecnologia.',
    slots: [
      { time: '15h15–16h', topic: 'Ciência de Dados' },
      { time: '16h–16h45', topic: 'Gestão' },
    ],
  },
  {
    name: 'France Oliveira',
    expertise: 'Ciência de dados e IA',
    city: 'Recife',
    linkedin: 'https://www.linkedin.com/in/franceoliveirac/',
    bio: 'Data Scientist II no Bradesco, é doutora em Estatística pela UFPE e atua com ciência de dados e inteligência artificial.',
    slots: [
      { time: '14h30–15h15', topic: 'Ciência de Dados' },
      { time: '16h–16h45', topic: 'Inteligência Artificial' },
    ],
  },
];

const mentorPhotos: Record<string, string> = {
  'Adriana Ribeiro, M.Sc': '/mentoras/01-adriana-ribeiro-de-souza.jpg',
  'Alice Cruz': '/mentoras/02-alice-cruz-magalhaes.jpg',
  'Amanda Melo': '/mentoras/03-amanda-albuquerque.jpg',
  'Analu Pucca': '/mentoras/04-ana-luiza-pucca-rodrigues.jpg',
  'Ana Vitória de Souza Cruz': '/mentoras/05-ana-vitoria-de-souza-cruz.jpg',
  'Andreyna Sena': '/mentoras/06-andreyna-sena.jpg',
  'Anny Araujo': '/mentoras/07-anny-da-silva-araujo.jpg',
  'Beatriz Benz': '/mentoras/08-beatriz-berto-de-matos-benz.jpg',
  'Gabriela Cavalcanti de Albuquerque': '/mentoras/09-gabriela-cavalcanti-de-albuquerque.jpg',
  'Geovana Santana': '/mentoras/10-geovana-maria-de-satana.jpg',
  'Joelma Mayara da Silva': '/mentoras/11-joelma-mayara-da-silva.jpg',
  'Júlia Sobral M.': '/mentoras/12-julia-sobral-de-mendonca.jpg',
  'Mariana Paulina Silva': '/mentoras/13-mariana-paulina-primo-da-silva.jpg',
  'Nicole Charron': '/mentoras/14-nicole-charron.jpg',
  'Rafaela Monteiro': '/mentoras/15-rafaela-monteiro.jpg',
  'Rayza Wilma': '/mentoras/16-rayza-wilma.jpg',
  'Sandra Mota': '/mentoras/17-sandra-cristina-mota-alexandre.jpg',
  'Sayumi Morimoto': '/mentoras/18-sayumi-morimoto.jpg',
  'Stephanie Lima Nascimento': '/mentoras/19-stephanie-lima-nascimento.jpg',
  'Tatiana Gomes de Farias': '/mentoras/20-tatiana-aparecida-gomes-de-farias.jpg',
  'Tatiana Tomé': '/mentoras/21-tatiana-goncalves-de-souza-tome.jpg',
  'Bruna Costa': '/mentoras/22-bruna-cecilia-pereira-da-costa.jpg',
  'France Oliveira': '/mentoras/23-france-evellyn-gomes-de-oliveira.jpg',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function legacyProfile(mentor: { name: string; linkedin: string | null }): Mentor | undefined {
  const linkedin = mentor.linkedin ? normalizeSearch(mentor.linkedin) : '';
  return legacyMentors.find((profile) => linkedin && normalizeSearch(profile.linkedin) === linkedin)
    ?? legacyMentors.find((profile) => normalizeSearch(profile.name).startsWith(normalizeSearch(mentor.name).split(' ')[0] ?? ''));
}

export default function P7MentorasBradesco() {
  const directory = useQuery((signal) => call(ENDPOINTS.E49Public, { signal }), []);
  const mentors: DirectoryMentor[] = directory.status === 'success'
    ? directory.data.items
    : directory.status === 'error'
      ? legacyMentors.map((mentor, index) => ({
          id: `legacy-${index}`,
          name: mentor.name,
          expertise: mentor.expertise,
          city: mentor.city,
          linkedin: mentor.linkedin,
          bio: mentor.bio,
          photoUrl: mentorPhotos[mentor.name] ?? null,
          themes: [{ name: mentor.expertise, domains: mentor.slots.map((slot) => slot.topic) }],
          slots: mentor.slots.map((slot, slotIndex) => ({
            id: `legacy-${index}-${slotIndex}`,
            time: slot.time,
            topic: slot.topic,
            available: false,
            reserved: false,
          })),
        }))
      : [];
  const mentorCount = directory.status === 'loading' ? '—' : mentors.length;
  const [query, setQuery] = useState('');
  const availableSlotCount = directory.status === 'loading'
    ? '—'
    : mentors.reduce((count, mentor) => count + mentor.slots.filter((slot) => !slot.reserved).length, 0);
  const filteredMentors = useMemo(() => {
    const search = normalizeSearch(query);
    return mentors.filter((mentor) => {
      const searchableText = normalizeSearch([
        mentor.name,
        mentor.expertise,
        mentor.bio,
        legacyProfile(mentor)?.bio ?? '',
        ...mentor.slots.map((slot) => slot.topic),
      ].join(' '));
      return !search || searchableText.includes(search);
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [mentors, query]);
  const hasFilters = Boolean(query);

  return (
    <div className="tw-pub tw-p7">
      <header className="tw-pub__head">
        <Brand height={44} />
        <nav className="tw-pub__nav" aria-label="Navegação da página">
          <Link to="/">Início</Link>
          <a href="#mentoras">As mentoras</a>
          <Link to="/jornada">Começar minha jornada</Link>
        </nav>
        <LinkButton to="/" size="sm">Voltar ao evento</LinkButton>
      </header>

      <main>
        <section className="tw-p7__hero">
          <div className="tw-pub__wrap tw-p7__hero-inner">
            <div className="tw-p7__hero-copy">
              <span className="tw-p7__eyebrow">Tech Woman + Bradesco</span>
              <h1>Experiências que abrem caminhos.</h1>
              <p>
                Conheça as mulheres do Bradesco que estão prontas para compartilhar
                aprendizados, falar sobre suas trajetórias e inspirar os próximos passos
                na tecnologia.
              </p>
              <a className="tw-p7__hero-link" href="#mentoras">Conheça as mentoras <span aria-hidden="true">↓</span></a>
            </div>
            <div className="tw-p7__hero-art" aria-hidden="true">
              <span className="tw-p7__orbit tw-p7__orbit--one" />
              <span className="tw-p7__orbit tw-p7__orbit--two" />
              <span className="tw-p7__hero-count">{mentorCount}<small>mentoras</small></span>
              <span className="tw-p7__hero-spark tw-p7__hero-spark--one">✦</span>
              <span className="tw-p7__hero-spark tw-p7__hero-spark--two">✦</span>
            </div>
          </div>
        </section>

        <section className="tw-p7__intro">
          <div className="tw-pub__wrap">
            <span className="tw-pub__eyebrow">Mentoria Tech Woman 2026</span>
            <h2>Uma conversa pode transformar uma possibilidade em caminho.</h2>
            <div className="tw-p7__intro-bottom">
              <p>
                Escolha um tema, conheça quem vai conduzir a conversa e encontre inspiração
                em histórias reais de quem constrói tecnologia todos os dias.
              </p>
              <div className="tw-p7__facts" aria-label="Informações das mentorias">
                <span><strong>45 min</strong> por conversa</span>
                <span><strong>{mentorCount}</strong> profissionais</span>
                <span><strong>{availableSlotCount}</strong> {availableSlotCount === 1 ? 'horário disponível' : 'horários disponíveis'}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="tw-p7__directory" id="mentoras">
          <div className="tw-pub__wrap">
            <div className="tw-p7__directory-heading">
              <div>
                <span className="tw-pub__eyebrow">Conheça quem inspira</span>
                <h2>Nossas mentoras Bradesco</h2>
              </div>
            </div>
            <div className="tw-p7__filters">
              <label className="tw-p7__search">
                <span>Busque por nome, especialidade ou tema</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ex.: dados, Java, liderança"
                />
              </label>
              {hasFilters && (
                <button className="tw-p7__clear" type="button" onClick={() => setQuery('')}>
                  Limpar filtros
                </button>
              )}
            </div>
            {directory.status === 'success' && (
              <p className="tw-p7__result-count" aria-live="polite">
                {filteredMentors.length === mentors.length
                  ? `${filteredMentors.length} mentoras`
                  : `${filteredMentors.length} de ${mentors.length} mentoras`}
              </p>
            )}
            {directory.status === 'loading' && <SkeletonList rows={3} height={180} />}
            <div className="tw-p7__grid">
              {filteredMentors.map((mentor) => {
                const index = mentors.indexOf(mentor);
                const profile = legacyProfile(mentor);
                const photo = mentor.photoUrl ?? (profile ? mentorPhotos[profile.name] : undefined);
                const bio = mentor.bio || profile?.bio;
                return (
                  <article className="tw-p7__card" key={mentor.name}>
                    <a className={`tw-p7__portrait tw-p7__portrait--${(index % 4) + 1}`} href={mentor.linkedin ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir perfil de ${mentor.name} no LinkedIn em nova aba`}>
                      {photo ? <img src={photo} alt="" loading="lazy" /> : <span aria-hidden="true">{initials(mentor.name)}</span>}
                      {!photo && <i aria-hidden="true" />}
                    </a>
                    <div className="tw-p7__card-content">
                      <div className="tw-p7__identity">
                        <span className="tw-p7__city">{mentor.city}</span>
                        <h3><a href={mentor.linkedin ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir perfil de ${mentor.name} no LinkedIn em nova aba`}>{mentor.name}</a></h3>
                        <p className="tw-p7__expertise">{mentor.expertise}</p>
                      </div>
                      {bio && <p className="tw-p7__bio">{bio}</p>}
                      {mentor.linkedin && <a className="tw-p7__linkedin" href={mentor.linkedin} target="_blank" rel="noopener noreferrer">
                        Ver perfil no LinkedIn <span>↗ <span className="tw-p7__new-tab">abre em nova aba</span></span>
                      </a>}
                    </div>
                  </article>
                );
              })}
            </div>
            {directory.status !== 'loading' && filteredMentors.length === 0 && (
              <div className="tw-p7__empty" role="status">
                <h3>{mentors.length === 0 ? 'Nenhuma mentora cadastrada' : 'Nenhuma mentora encontrada'}</h3>
                <p>{mentors.length === 0 ? 'As mentoras cadastradas aparecerão aqui quando o catálogo for atualizado.' : 'Tente outro nome, tema ou disponibilidade para encontrar uma mentora.'}</p>
                <button className="tw-p7__clear" type="button" onClick={() => setQuery('')}>Ver todas as mentoras</button>
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
          <span>© 2026 Tech Woman · Mentoras Bradesco</span>
          <Link to="/">Voltar ao início</Link>
        </div>
      </footer>
    </div>
  );
}
