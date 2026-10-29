/** Categorias de afinidade alinhadas aos temas e domínios do catálogo de mentoras Bradesco. */
export const AREAS: Record<string, string> = {
  carreira: 'Carreira e transição',
  dados: 'Dados e analytics',
  ia: 'Inteligência artificial',
  desenvolvimento: 'Desenvolvimento de software',
  produto_plataformas: 'Produtos digitais e plataformas',
  lideranca: 'Liderança, gestão e soft skills',
  infraestrutura: 'Infraestrutura e operações',
};

export const TRAILS = [
  { key: 'transition', title: 'Transição de Carreira', description: 'Transição para tecnologia, posicionamento profissional, currículo, networking e próximos passos de carreira.', color: '#f26430' },
  { key: 'technical', title: 'Crescimento e Especialização Técnica', description: 'Engenharia de dados e analytics, inteligência artificial, desenvolvimento de software, produtos digitais, plataformas, infraestrutura, cloud e operações.', color: '#8a1f96' },
  { key: 'leadership', title: 'Liderança e Gestão', description: 'Liderança técnica e de pessoas, gestão de times, comunicação, influência, metodologias ágeis e desenvolvimento de equipes.', color: '#c9f4ee' },
] as const;

export const PERFIS: Record<string, { nome: string; desc: string }> = {
  analitica: { nome: 'Analista', desc: 'Curiosa, enxerga padrões e gosta de números.' },
  construtora: { nome: 'Construtora', desc: 'Mão na massa: gosta de fazer as coisas funcionarem.' },
  criativa: { nome: 'Criativa', desc: 'Visual e empática, pensa sempre nas pessoas.' },
  estrategista: { nome: 'Estrategista', desc: 'Organizada, com visão de negócio e prioridades claras.' },
  guardia: { nome: 'Guardiã', desc: 'Detalhista, garante que nada saia do ar.' },
};

export const TRACOS: Record<string, { grupo: string; frase: string; chip: string }> = {
  analitica: { grupo: 'analitica', frase: 'perfil analítico', chip: 'Analítica' },
  numeros: { grupo: 'analitica', frase: 'interesse por números', chip: 'Números' },
  logica: { grupo: 'construtora', frase: 'raciocínio lógico', chip: 'Lógica' },
  construtora: { grupo: 'construtora', frase: 'gosto por colocar a mão na massa', chip: 'Mão na massa' },
  criativa: { grupo: 'criativa', frase: 'criatividade', chip: 'Criativa' },
  empatia: { grupo: 'criativa', frase: 'empatia', chip: 'Empática' },
  estrategista: { grupo: 'estrategista', frase: 'visão estratégica', chip: 'Estratégica' },
  guardia: { grupo: 'guardia', frase: 'atenção a detalhes', chip: 'Detalhista' },
};

export interface Option { label: string; s: Record<string, number>; t: string[]; matchTerms: string[] }
export interface Question { tipo: 'pergunta'; texto: string; opcoes: Option[] }

/** Sete perguntas de abordagem e colaboração após o momento e o aprofundamento adaptativo. */
export const QUESTIONS: Question[] = [
  { tipo: 'pergunta', texto: 'Diante de um problema novo, qual costuma ser sua primeira reação?', opcoes: [
    { label: 'Procurar padrões e evidências antes de decidir', s: { dados: 3 }, t: ['analitica', 'numeros'], matchTerms: ['analise de dados', 'ciencia de dados', 'visualizacao de dados', 'qualidade de dados'] },
    { label: 'Entender a necessidade das pessoas envolvidas', s: { produto_plataformas: 2, lideranca: 1 }, t: ['criativa', 'empatia'], matchTerms: ['discovery', 'produto digital', 'comunicacao', 'gestao de pessoas'] },
    { label: 'Experimentar uma solução e aprender fazendo', s: { desenvolvimento: 3 }, t: ['construtora', 'logica'], matchTerms: ['desenvolvimento de software', 'backend', 'frontend', 'java', 'clean code'] },
    { label: 'Investigar riscos e garantir que tudo continue funcionando', s: { infraestrutura: 3 }, t: ['guardia'], matchTerms: ['infraestrutura', 'cloud', 'aiops', 'observabilidade', 'domain controller'] },
  ] },
  { tipo: 'pergunta', texto: 'Que tipo de resultado dá mais satisfação ao final de um projeto?', opcoes: [
    { label: 'Uma decisão melhor apoiada por dados', s: { dados: 3 }, t: ['analitica', 'numeros'], matchTerms: ['qualidade de dados', 'modelagem de dados', 'storytelling com dados'] },
    { label: 'Uma jornada mais simples para quem usa o produto', s: { produto_plataformas: 3 }, t: ['criativa', 'empatia'], matchTerms: ['experiencia', 'jornadas', 'produtos digitais', 'discovery'] },
    { label: 'Uma solução confiável, bem testada e fácil de manter', s: { desenvolvimento: 2, infraestrutura: 1 }, t: ['construtora'], matchTerms: ['testes funcionais', 'testes de regressao', 'qualidade de engenharia de software', 'clean code'] },
    { label: 'Um time alinhado, seguro e capaz de avançar', s: { lideranca: 3 }, t: ['estrategista'], matchTerms: ['lideranca', 'gestao de times', 'comunicacao assertiva', 'desenvolvimento de equipes'] },
  ] },
  { tipo: 'pergunta', texto: 'Como você prefere aprender algo que ainda não conhece?', opcoes: [
    { label: 'Explorar dados, exemplos e evidências até encontrar padrões', s: { dados: 3 }, t: ['analitica'], matchTerms: ['analise de dados', 'estatistica', 'pesquisa e desenvolvimento'] },
    { label: 'Testar modelos e explorar possibilidades com inteligência artificial', s: { ia: 3 }, t: ['analitica'], matchTerms: ['machine learning', 'inteligencia artificial', 'agentes de ia', 'llm'] },
    { label: 'Observar pessoas usando uma solução e testar melhorias', s: { produto_plataformas: 3 }, t: ['criativa', 'empatia'], matchTerms: ['discovery', 'produto digital', 'experiencia', 'testes de usabilidade'] },
    { label: 'Construir um protótipo, testar e ajustar o código', s: { desenvolvimento: 3 }, t: ['construtora', 'logica'], matchTerms: ['programacao', 'backend', 'frontend', 'apis rest', 'servicenow'] },
    { label: 'Investigar um cenário real e documentar como resolvê-lo', s: { infraestrutura: 2, lideranca: 1 }, t: ['guardia'], matchTerms: ['infraestrutura', 'domain controller', 'observabilidade', 'documentacoes tecnicas'] },
  ] },
  { tipo: 'pergunta', texto: 'Em uma equipe multidisciplinar, que contribuição você costuma oferecer?', opcoes: [
    { label: 'Transformar informações em análises que orientam decisões', s: { dados: 3 }, t: ['analitica'], matchTerms: ['visualizacao de dados', 'storytelling com dados', 'analise de dados', 'regras de negocio'] },
    { label: 'Conectar necessidades das pessoas às prioridades do produto', s: { produto_plataformas: 2, lideranca: 1 }, t: ['empatia', 'estrategista'], matchTerms: ['gestao de produto', 'discovery', 'priorizacao', 'stakeholders'] },
    { label: 'Tirar uma solução do papel com qualidade técnica', s: { desenvolvimento: 3 }, t: ['construtora'], matchTerms: ['engenharia de software', 'qualidade de software', 'desenvolvimento', 'arquitetura'] },
    { label: 'Organizar acordos, comunicação e evolução do time', s: { lideranca: 3 }, t: ['estrategista'], matchTerms: ['gestao de pessoas', 'comunicacao', 'influencia', 'lideranca'] },
  ] },
  { tipo: 'pergunta', texto: 'Que aspecto você verifica para confiar em uma solução digital?', opcoes: [
    { label: 'Se os dados são consistentes e explicam o que está acontecendo', s: { dados: 3 }, t: ['analitica', 'guardia'], matchTerms: ['qualidade de dados', 'modelagem de dados', 'regras de negocio', 'dataops'] },
    { label: 'Se a experiência atende às necessidades de quem usa', s: { produto_plataformas: 3 }, t: ['criativa'], matchTerms: ['produtos digitais', 'discovery', 'jornadas', 'produto digital'] },
    { label: 'Se o software foi testado e segue boas práticas', s: { desenvolvimento: 3 }, t: ['guardia', 'construtora'], matchTerms: ['testes funcionais', 'testes de regressao', 'boas praticas', 'qualidade no desenvolvimento do software'] },
    { label: 'Se o serviço é seguro, estável e observável', s: { infraestrutura: 3 }, t: ['guardia'], matchTerms: ['infraestrutura', 'cloud', 'observabilidade', 'aiops', 'services'] },
  ] },
  { tipo: 'pergunta', texto: 'Qual desafio você gostaria de ajudar a resolver no próximo projeto?', opcoes: [
    { label: 'Automatizar análises e descobrir novas oportunidades com dados', s: { dados: 3 }, t: ['analitica'], matchTerms: ['analise de dados', 'automacao', 'databricks'] },
    { label: 'Criar soluções inteligentes com modelos e agentes de IA', s: { ia: 3 }, t: ['analitica'], matchTerms: ['machine learning', 'agentes de ia', 'automacao e produtividade com ia', 'ia gen', 'llm'] },
    { label: 'Desenhar uma solução digital útil e evoluí-la com as pessoas', s: { produto_plataformas: 3 }, t: ['criativa', 'estrategista'], matchTerms: ['produto digital', 'discovery', 'delivery', 'plataformas'] },
    { label: 'Melhorar arquitetura, integração ou qualidade do software', s: { desenvolvimento: 3 }, t: ['construtora'], matchTerms: ['arquitetura', 'apis rest', 'qualidade de software', 'engenharia de plataformas'] },
    { label: 'Aumentar a colaboração, autonomia e impacto de um time', s: { lideranca: 3 }, t: ['estrategista'], matchTerms: ['lideranca', 'gestao de times', 'lideranca feminina', 'influencia'] },
  ] },
  { tipo: 'pergunta', texto: 'Qual impacto você gostaria que seu trabalho tivesse para outras pessoas?', opcoes: [
    { label: 'Ajudar a tomar decisões mais informadas com dados confiáveis', s: { dados: 3 }, t: ['analitica'], matchTerms: ['analise de dados', 'visualizacao de dados', 'storytelling com dados'] },
    { label: 'Criar experiências e processos com inteligência artificial', s: { ia: 3 }, t: ['analitica'], matchTerms: ['inteligencia artificial', 'agentes de ia', 'machine learning', 'llm'] },
    { label: 'Tornar produtos e serviços mais úteis e fáceis de usar', s: { produto_plataformas: 3 }, t: ['criativa', 'empatia'], matchTerms: ['produtos digitais', 'experiencia', 'discovery', 'produto digital'] },
    { label: 'Entregar tecnologia robusta que resolva problemas reais', s: { desenvolvimento: 2, infraestrutura: 1 }, t: ['construtora'], matchTerms: ['desenvolvimento de software', 'backend', 'infraestrutura', 'qualidade de software'] },
    { label: 'Apoiar pessoas e equipes a crescerem com confiança', s: { lideranca: 3, carreira: 1 }, t: ['estrategista'], matchTerms: ['lideranca', 'desenvolvimento de carreira', 'gestao de pessoas', 'comunicacao'] },
  ] },
];

export type MentoringStage = 'transition' | 'technical' | 'leadership';
export interface MentorQuestion {
  texto: string;
  opcoes: { label: string; stage: MentoringStage; areas: (keyof typeof AREAS)[]; matchTerms: string[] }[];
}

export const STAGE_QUESTION: MentorQuestion = {
  texto: 'Em que momento da sua trajetória você está?', opcoes: [
    { label: 'Estou começando ou quero migrar para tecnologia', stage: 'transition', areas: ['carreira'], matchTerms: ['transicao de carreira', 'inicio de carreira', 'curriculo', 'posicionamento profissional', 'networking'] },
    { label: 'Já atuo na área e quero aprofundar minha prática técnica', stage: 'technical', areas: ['dados', 'ia', 'desenvolvimento', 'produto_plataformas', 'infraestrutura'], matchTerms: ['engenharia de dados', 'machine learning', 'desenvolvimento', 'produtos digitais', 'infraestrutura'] },
    { label: 'Quero assumir mais responsabilidade ou crescer em liderança', stage: 'leadership', areas: ['lideranca'], matchTerms: ['lideranca', 'gestao de pessoas', 'gestao de times', 'comunicacao', 'influencia'] },
  ],
};

const STAGE_FOLLOW_UPS: Record<MentoringStage, MentorQuestion[]> = {
  transition: [
    { texto: 'Em qual área de tecnologia você gostaria de construir seu próximo passo?', opcoes: [
      { label: 'Engenharia, análise ou ciência de dados', stage: 'transition', areas: ['dados'], matchTerms: ['engenharia de dados', 'analise de dados', 'ciencia de dados', 'power bi', 'databricks'] },
      { label: 'Inteligência artificial, machine learning ou agentes', stage: 'transition', areas: ['ia'], matchTerms: ['machine learning', 'inteligencia artificial', 'agentes de ia', 'llm', 'prompt engineering'] },
      { label: 'Desenvolvimento de software, como backend, frontend ou Java', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['backend', 'frontend', 'java', 'desenvolvimento de software', 'servicenow'] },
      { label: 'Produtos digitais, experiência ou plataformas', stage: 'transition', areas: ['produto_plataformas'], matchTerms: ['produtos digitais', 'discovery', 'produto digital', 'plataformas', 'arquitetura'] },
      { label: 'Infraestrutura, cloud ou operações', stage: 'transition', areas: ['infraestrutura'], matchTerms: ['infraestrutura', 'cloud', 'azure', 'aws', 'aiops', 'observabilidade'] },
      { label: 'Ainda estou explorando possibilidades e preciso de orientação de carreira', stage: 'transition', areas: ['carreira'], matchTerms: ['transicao de carreira', 'planejamento de carreira', 'posicionamento profissional', 'curriculo', 'networking'] },
    ] },
    { texto: 'O que mais ajudaria você a avançar nessa transição?', opcoes: [
      { label: 'Entender quais competências desenvolver e como montar um plano de estudos', stage: 'transition', areas: ['carreira'], matchTerms: ['planejamento de carreira', 'desenvolvimento profissional', 'transicao de carreira', 'formacao'] },
      { label: 'Criar projetos e ganhar prática em desenvolvimento de software', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['desenvolvimento de software', 'backend', 'frontend', 'java', 'apis rest'] },
      { label: 'Desenvolver conhecimentos de dados e analytics', stage: 'transition', areas: ['dados'], matchTerms: ['engenharia de dados', 'analise de dados', 'databricks', 'power bi', 'modelagem de dados'] },
      { label: 'Aprender a aplicar inteligência artificial e machine learning', stage: 'transition', areas: ['ia'], matchTerms: ['machine learning', 'agentes de ia', 'inteligencia artificial', 'llm', 'prompt engineering'] },
      { label: 'Preparar currículo, entrevistas e networking para buscar oportunidades', stage: 'transition', areas: ['carreira'], matchTerms: ['curriculo', 'entrevista', 'networking', 'posicionamento profissional', 'transicao de carreira'] },
      { label: 'Conhecer produto digital, cloud ou infraestrutura na prática', stage: 'transition', areas: ['produto_plataformas', 'infraestrutura'], matchTerms: ['produtos digitais', 'discovery', 'cloud', 'infraestrutura', 'observabilidade'] },
    ] },
  ],
  technical: [
    { texto: 'Em qual especialidade técnica você quer se aprofundar?', opcoes: [
      { label: 'Engenharia, análise ou ciência de dados', stage: 'technical', areas: ['dados'], matchTerms: ['engenharia de dados', 'analise de dados', 'ciencia de dados', 'power bi', 'databricks'] },
      { label: 'Machine learning, IA generativa ou agentes de IA', stage: 'technical', areas: ['ia'], matchTerms: ['machine learning', 'inteligencia artificial', 'agentes de ia', 'llm', 'prompt engineering'] },
      { label: 'Backend, frontend, Java ou qualidade de software', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['backend', 'frontend', 'java', 'qualidade de software', 'servicenow'] },
      { label: 'Produtos digitais, arquitetura ou plataformas', stage: 'technical', areas: ['produto_plataformas'], matchTerms: ['produtos digitais', 'arquitetura', 'plataformas', 'discovery', 'delivery'] },
      { label: 'Cloud, infraestrutura, operações ou observabilidade', stage: 'technical', areas: ['infraestrutura'], matchTerms: ['cloud', 'azure', 'aws', 'infraestrutura', 'aiops', 'observabilidade'] },
    ] },
    { texto: 'Que tipo de desafio técnico você gostaria de resolver com uma mentora?', opcoes: [
      { label: 'Desenhar pipelines, modelagem ou qualidade de dados', stage: 'technical', areas: ['dados'], matchTerms: ['pipeline de dados', 'modelagem de dados', 'dataops', 'qualidade de dados', 'databricks'] },
      { label: 'Aplicar IA ou machine learning a um problema real', stage: 'technical', areas: ['ia'], matchTerms: ['machine learning', 'inteligencia artificial', 'agentes de ia', 'llm', 'prompt engineering'] },
      { label: 'Projetar, desenvolver ou testar sistemas e APIs', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['backend', 'apis rest', 'java', 'testes funcionais', 'clean code'] },
      { label: 'Evoluir arquitetura, produto ou plataforma digital', stage: 'technical', areas: ['produto_plataformas'], matchTerms: ['arquitetura', 'produtos digitais', 'plataformas', 'discovery', 'delivery'] },
      { label: 'Melhorar disponibilidade, cloud ou operações de sistemas', stage: 'technical', areas: ['infraestrutura'], matchTerms: ['cloud', 'infraestrutura', 'aiops', 'observabilidade', 'domain controller'] },
    ] },
  ],
  leadership: [
    { texto: 'Qual desafio de liderança está mais presente para você?', opcoes: [
      { label: 'Desenvolver e engajar pessoas no time', stage: 'leadership', areas: ['lideranca'], matchTerms: ['lideranca', 'gestao de pessoas', 'gestao de times', 'desenvolvimento de equipes'] },
      { label: 'Comunicar ideias e influenciar decisões', stage: 'leadership', areas: ['lideranca'], matchTerms: ['comunicacao', 'influencia', 'negociacao', 'stakeholders'] },
      { label: 'Priorizar iniciativas e conduzir entregas', stage: 'leadership', areas: ['lideranca', 'produto_plataformas'], matchTerms: ['gestao de times', 'priorizacao', 'delivery', 'metodologia agil', 'gestao de produto'] },
      { label: 'Tomar decisões técnicas e orientar outras pessoas', stage: 'leadership', areas: ['lideranca', 'desenvolvimento'], matchTerms: ['lideranca tecnica', 'arquitetura', 'desenvolvimento de software', 'mentoria', 'tomada de decisao'] },
      { label: 'Ampliar minha influência e me preparar para uma nova posição', stage: 'leadership', areas: ['lideranca', 'carreira'], matchTerms: ['influencia', 'posicionamento profissional', 'planejamento de carreira', 'lideranca', 'networking'] },
    ] },
    { texto: 'Que resultado faria diferença no seu próximo passo como líder?', opcoes: [
      { label: 'Mais confiança para dar feedback e desenvolver pessoas', stage: 'leadership', areas: ['lideranca'], matchTerms: ['feedback', 'gestao de pessoas', 'lideranca', 'desenvolvimento de equipes'] },
      { label: 'Mais clareza para alinhar prioridades, estratégia e entregas', stage: 'leadership', areas: ['lideranca', 'produto_plataformas'], matchTerms: ['estrategia', 'priorizacao', 'delivery', 'gestao de times', 'metodologia agil'] },
      { label: 'Conduzir conversas difíceis e influenciar stakeholders', stage: 'leadership', areas: ['lideranca'], matchTerms: ['comunicacao', 'influencia', 'negociacao', 'stakeholders'] },
      { label: 'Orientar decisões e crescimento técnico do time', stage: 'leadership', areas: ['lideranca', 'desenvolvimento'], matchTerms: ['lideranca tecnica', 'arquitetura', 'desenvolvimento de software', 'mentoria'] },
      { label: 'Me preparar para assumir mais responsabilidade ou uma nova posição', stage: 'leadership', areas: ['lideranca', 'carreira'], matchTerms: ['planejamento de carreira', 'posicionamento profissional', 'lideranca', 'influencia'] },
    ] },
  ],
};

const FOCUSED_FOLLOW_UPS: Record<MentoringStage, MentorQuestion[]> = {
  transition: [
    { texto: 'Em dados, que primeira prática você gostaria de desenvolver?', opcoes: [
      { label: 'Construir pipelines, tratar e modelar dados', stage: 'transition', areas: ['dados'], matchTerms: ['pipeline de dados', 'tratativa de dados', 'modelagem de dados', 'engenharia de dados'] },
      { label: 'Aprender Databricks, cloud e ferramentas de dados', stage: 'transition', areas: ['dados'], matchTerms: ['databricks', 'azure', 'aws', 'power bi'] },
      { label: 'Explorar analytics, estatística ou visualização', stage: 'transition', areas: ['dados'], matchTerms: ['analise de dados', 'ciencia de dados', 'estatistica', 'visualizacao de dados'] },
    ] },
    { texto: 'Em inteligência artificial, o que você gostaria de experimentar primeiro?', opcoes: [
      { label: 'Usar modelos de IA para resolver problemas do dia a dia', stage: 'transition', areas: ['ia'], matchTerms: ['inteligencia artificial', 'ia gen', 'automacao e produtividade com ia'] },
      { label: 'Aprender os fundamentos de machine learning', stage: 'transition', areas: ['ia'], matchTerms: ['machine learning', 'modelos preditivos'] },
      { label: 'Explorar agentes, LLMs e prompt engineering', stage: 'transition', areas: ['ia'], matchTerms: ['agentes de ia', 'llm', 'prompt engineering'] },
    ] },
    { texto: 'Em desenvolvimento, qual caminho prático combina mais com seu objetivo?', opcoes: [
      { label: 'Criar aplicações, APIs e serviços backend', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['backend', 'apis rest', 'java', 'desenvolvimento de software'] },
      { label: 'Construir interfaces e soluções full stack', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['frontend', 'desenvolvimento full stack', 'programacao'] },
      { label: 'Aprender testes, qualidade e boas práticas', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['testes funcionais', 'testes de regressao', 'qualidade de software', 'clean code'] },
      { label: 'Conhecer plataformas como ServiceNow', stage: 'transition', areas: ['desenvolvimento'], matchTerms: ['servicenow', 'plataformas'] },
    ] },
    { texto: 'Em produtos e plataformas, o que você gostaria de aprender fazendo?', opcoes: [
      { label: 'Discovery, jornadas e necessidades das pessoas', stage: 'transition', areas: ['produto_plataformas'], matchTerms: ['discovery', 'produto digital', 'jornadas'] },
      { label: 'Planejar entregas e evoluir produtos digitais', stage: 'transition', areas: ['produto_plataformas'], matchTerms: ['delivery', 'produtos digitais', 'gestao de produto'] },
      { label: 'Entender arquitetura e plataformas de engenharia', stage: 'transition', areas: ['produto_plataformas'], matchTerms: ['arquitetura', 'plataformas', 'engenharia de plataformas'] },
    ] },
    { texto: 'Em infraestrutura, qual assunto quer conhecer melhor?', opcoes: [
      { label: 'Cloud, Azure ou AWS', stage: 'transition', areas: ['infraestrutura'], matchTerms: ['cloud', 'azure', 'aws'] },
      { label: 'Redes, Domain Controller e serviços de diretório', stage: 'transition', areas: ['infraestrutura'], matchTerms: ['domain controller', 'dhcp', 'dns', 'infraestrutura'] },
      { label: 'Operações, AIOps e observabilidade', stage: 'transition', areas: ['infraestrutura'], matchTerms: ['aiops', 'observabilidade', 'operacoes'] },
    ] },
    { texto: 'Qual apoio de carreira seria mais importante neste começo?', opcoes: [
      { label: 'Planejar estudos, cursos e certificações', stage: 'transition', areas: ['carreira'], matchTerms: ['planejamento de estudos', 'cursos', 'certificacoes', 'formacao'] },
      { label: 'Preparar currículo, portfólio e entrevistas', stage: 'transition', areas: ['carreira'], matchTerms: ['curriculo', 'portfolio', 'entrevista', 'posicionamento'] },
      { label: 'Construir networking e confiança para a mudança', stage: 'transition', areas: ['carreira'], matchTerms: ['networking', 'comunicacao', 'autoconfianca', 'transicao de carreira'] },
    ] },
  ],
  technical: [
    { texto: 'Em dados, qual desafio técnico quer aprofundar?', opcoes: [
      { label: 'Pipelines, modelagem e qualidade de dados', stage: 'technical', areas: ['dados'], matchTerms: ['pipeline de dados', 'modelagem de dados', 'qualidade de dados', 'databricks'] },
      { label: 'Analytics, estatística e storytelling com dados', stage: 'technical', areas: ['dados'], matchTerms: ['analise de dados', 'estatistica', 'storytelling com dados', 'visualizacao de dados'] },
    ] },
    { texto: 'Em IA, que aplicação você gostaria de explorar?', opcoes: [
      { label: 'Agentes de IA, workflows e prompt engineering', stage: 'technical', areas: ['ia'], matchTerms: ['agentes de ia', 'workflows', 'prompt engineering', 'llm'] },
      { label: 'Machine learning e avaliação de modelos', stage: 'technical', areas: ['ia'], matchTerms: ['machine learning', 'avaliacao', 'qualidade de solucoes de ia'] },
      { label: 'IA aplicada à engenharia e ao ciclo de desenvolvimento', stage: 'technical', areas: ['desenvolvimento', 'ia'], matchTerms: ['engenharia de ia', 'sdlc', 'ciclo de desenvolvimento com ia'] },
    ] },
    { texto: 'Em desenvolvimento, qual especialidade quer aprofundar?', opcoes: [
      { label: 'Backend, Java, APIs e arquitetura', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['backend', 'java', 'apis rest', 'arquitetura'] },
      { label: 'Full stack, frontend e programação', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['full stack', 'frontend', 'programacao'] },
      { label: 'Testes, qualidade de software e plataformas', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['testes funcionais', 'testes de regressao', 'qualidade de engenharia de software', 'engenharia de plataformas'] },
      { label: 'Desenvolvimento em ServiceNow', stage: 'technical', areas: ['desenvolvimento'], matchTerms: ['servicenow', 'portal unico'] },
    ] },
    { texto: 'Em produtos e plataformas, qual desafio quer resolver?', opcoes: [
      { label: 'Discovery e evolução de produtos digitais', stage: 'technical', areas: ['produto_plataformas'], matchTerms: ['discovery', 'produtos digitais', 'gestao de produto'] },
      { label: 'Arquitetura e plataformas de engenharia', stage: 'technical', areas: ['produto_plataformas'], matchTerms: ['arquitetura', 'plataformas', 'engenharia de plataformas'] },
      { label: 'Delivery, APIs e integração entre sistemas', stage: 'technical', areas: ['produto_plataformas'], matchTerms: ['delivery', 'apis', 'integracao'] },
    ] },
    { texto: 'Em infraestrutura, qual especialidade quer aprofundar?', opcoes: [
      { label: 'Cloud, Azure, AWS e arquitetura de dados', stage: 'technical', areas: ['infraestrutura', 'dados'], matchTerms: ['cloud', 'azure', 'aws', 'arquitetura de dados'] },
      { label: 'Domain Controller, AD, DHCP e DNS', stage: 'technical', areas: ['infraestrutura'], matchTerms: ['domain controller', 'dhcp', 'dns', 'services'] },
      { label: 'AIOps, automação e observabilidade inteligente', stage: 'technical', areas: ['infraestrutura'], matchTerms: ['aiops', 'observabilidade', 'automacao inteligente'] },
    ] },
  ],
  leadership: [
    { texto: 'Para desenvolver pessoas, qual prática quer fortalecer?', opcoes: [
      { label: 'Feedback e conversas de desenvolvimento', stage: 'leadership', areas: ['lideranca'], matchTerms: ['feedback', 'conversas de desenvolvimento', 'gestao de pessoas'] },
      { label: 'Engajamento e dinâmica de equipes', stage: 'leadership', areas: ['lideranca'], matchTerms: ['gestao de times', 'dinamica de equipes', 'desenvolvimento de equipes'] },
      { label: 'Liderança feminina e desenvolvimento de carreira', stage: 'leadership', areas: ['lideranca', 'carreira'], matchTerms: ['lideranca feminina', 'desenvolvimento de carreira', 'planejamento de carreira'] },
    ] },
    { texto: 'Para comunicar e influenciar, que situação quer trabalhar?', opcoes: [
      { label: 'Comunicação assertiva com públicos diferentes', stage: 'leadership', areas: ['lideranca'], matchTerms: ['comunicacao assertiva', 'comunicacao', 'publicos tecnico'] },
      { label: 'Influência, negociação e alinhamento com stakeholders', stage: 'leadership', areas: ['lideranca'], matchTerms: ['influencia', 'negociacao', 'stakeholders'] },
      { label: 'Posicionamento e visibilidade profissional', stage: 'leadership', areas: ['lideranca', 'carreira'], matchTerms: ['posicionamento', 'visibilidade', 'linkedin'] },
    ] },
    { texto: 'Para priorizar e conduzir entregas, qual foco faz sentido?', opcoes: [
      { label: 'Estratégia, priorização e tomada de decisão', stage: 'leadership', areas: ['lideranca'], matchTerms: ['estrategia', 'priorizacao', 'tomada de decisao'] },
      { label: 'Gestão ágil de times e projetos', stage: 'leadership', areas: ['lideranca'], matchTerms: ['metodologia agil', 'metodos ageis', 'gestao de projetos', 'gestao de times'] },
      { label: 'Gestão de produto, delivery e APIs', stage: 'leadership', areas: ['lideranca', 'produto_plataformas'], matchTerms: ['gestao de produto', 'delivery', 'plataformas de apis'] },
    ] },
    { texto: 'Para liderar tecnicamente, qual desafio quer aprofundar?', opcoes: [
      { label: 'Orientar decisões de arquitetura e backend', stage: 'leadership', areas: ['lideranca', 'desenvolvimento'], matchTerms: ['lideranca tecnica', 'arquitetura', 'backend', 'java'] },
      { label: 'Desenvolver boas práticas de software e plataformas', stage: 'leadership', areas: ['lideranca', 'desenvolvimento'], matchTerms: ['boas praticas', 'engenharia de software', 'plataformas'] },
      { label: 'Fazer a transição de especialista para liderança', stage: 'leadership', areas: ['lideranca'], matchTerms: ['transicao de carreira tecnica para gestao', 'par tecnico', 'lideranca de pessoas'] },
    ] },
    { texto: 'Para ampliar sua atuação como líder, qual próximo passo busca?', opcoes: [
      { label: 'Assumir uma posição de liderança ou gestão', stage: 'leadership', areas: ['lideranca'], matchTerms: ['lideranca', 'gestao', 'posicionamento profissional'] },
      { label: 'Desenvolver visão estratégica para tecnologia e negócio', stage: 'leadership', areas: ['lideranca'], matchTerms: ['visao estrategica', 'negocio', 'tomada de decisao'] },
      { label: 'Equilibrar carreira, liderança e vida pessoal', stage: 'leadership', areas: ['lideranca'], matchTerms: ['equilibrio entre carreira', 'lideranca', 'vida pessoal'] },
    ] },
  ],
};

export const MENTOR_QUESTION_COUNT = 3;

export function getMentorQuestions(stage: MentoringStage | null, focusIndex?: number): MentorQuestion[] {
  if (!stage) return [STAGE_QUESTION];
  const stageQuestions = STAGE_FOLLOW_UPS[stage];
  const focusedQuestion = focusIndex == null ? stageQuestions[1] : FOCUSED_FOLLOW_UPS[stage][focusIndex] ?? stageQuestions[1];
  return [STAGE_QUESTION, stageQuestions[0]!, focusedQuestion!];
}

/** Respostas: índice da opção escolhida em cada pergunta. */
export type Answers = Record<number, number>;
export type MentorAnswers = Record<number, number>;

export function calcXp(answers: Answers, mentorAnswers: MentorAnswers = {}): number {
  let xp = 0;
  QUESTIONS.forEach((_, i) => {
    if (answers[i] != null) xp += 10;
  });
  for (let i = 0; i < MENTOR_QUESTION_COUNT; i += 1) {
    if (mentorAnswers[i] != null) xp += 10;
  }
  return xp;
}

export interface JourneyResult {
  score: Record<string, number>;
  ranking: string[];
  nivelDe: (k: string) => number;
  tracos: string[];
  perfil: string;
  pct: (k: string) => number;
}

export function computeResult(answers: Answers): JourneyResult {
  const keys = Object.keys(AREAS);
  const score: Record<string, number> = {};
  const maxPos: Record<string, number> = {};
  keys.forEach((k) => { score[k] = 0; maxPos[k] = 0; });
  const count: Record<string, number> = {};
  const ordem: string[] = [];
  const grupos: Record<string, number> = {};
  QUESTIONS.forEach((q, idx) => {
    keys.forEach((k) => { maxPos[k]! += Math.max(0, ...q.opcoes.map((o) => o.s[k] ?? 0)); });
    const a = answers[idx];
    if (a == null) return;
    const o = q.opcoes[a]!;
    Object.entries(o.s).forEach(([k, v]) => { score[k]! += v; });
    o.t.forEach((t) => {
      if (!(t in count)) { count[t] = 0; ordem.push(t); }
      count[t]! += 1;
      const g = TRACOS[t]!.grupo;
      grupos[g] = (grupos[g] ?? 0) + 1;
    });
  });
  const ratio = (k: string) => score[k]! / (maxPos[k] || 1);
  const ranking = [...keys].sort((x, y) => ratio(y) - ratio(x) || score[y]! - score[x]!);
  const tracos = [...ordem].sort((x, y) => count[y]! - count[x]!).slice(0, 3);
  ['analitica', 'criativa', 'construtora'].forEach((t) => { if (tracos.length < 3 && !tracos.includes(t)) tracos.push(t); });
  const perfil = Object.keys(grupos).sort((x, y) => grupos[y]! - grupos[x]!)[0] ?? 'construtora';
  return {
    score, ranking, tracos, perfil,
    nivelDe: (k) => Math.max(1, Math.min(5, Math.round(ratio(k) * 5))),
    pct: (k) => Math.max(6, Math.round(ratio(k) * 100)),
  };
}

const KEY = 'tw:answers';
export function loadAnswers(): Answers | null {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Answers) : null; } catch { return null; }
}
export function saveAnswers(a: Answers | null): void {
  try { if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); } catch { /* ignora */ }
}

const MENTOR_KEY = 'tw:mentor-answers:v3';
export interface MentorJourney {
  answers: MentorAnswers;
  tieSeed: string;
}

export function loadMentorJourney(): MentorJourney | null {
  try {
    const raw = sessionStorage.getItem(MENTOR_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as MentorJourney;
    return value.answers && typeof value.tieSeed === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function saveMentorJourney(answers: MentorAnswers | null): void {
  try {
    if (!answers) {
      sessionStorage.removeItem(MENTOR_KEY);
      return;
    }
    const tieSeed = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(MENTOR_KEY, JSON.stringify({ answers, tieSeed }));
  } catch {
    /* armazenamento indisponível */
  }
}
