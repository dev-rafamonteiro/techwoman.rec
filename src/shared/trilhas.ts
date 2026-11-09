/** As `key` são as áreas do evento (A7, E01): a inscrição (E02) recusa área que não esteja lá. */
export const KNOWLEDGE_TRACKS = [
  {
    key: 'desenvolvimento',
    label: 'Desenvolvimento',
    description: 'Crie e melhore sites, aplicativos e sistemas, da parte que as pessoas usam ao que funciona nos bastidores.',
    color: '#f26430',
    specialties: [
      'Desenvolvimento Back-end',
      'Desenvolvimento Front-end / UX',
      'Desenvolvimento Full Stack',
      'Desenvolvimento SAP',
      'Desenvolvimento ServiceNow',
    ],
  },
  {
    key: 'qualidade',
    label: 'Qualidade',
    description: 'Teste programas e aplicativos para encontrar problemas e garantir que funcionem como as pessoas esperam.',
    color: '#8a1f96',
    specialties: ['Qualidade de Engenharia de Software', 'Quality Assurance'],
  },
  {
    key: 'inteligencia-artificial',
    label: 'Inteligência Artificial',
    description: 'Crie e use sistemas que aprendem, geram conteúdo ou automatizam tarefas, como assistentes e agentes de IA.',
    color: '#d98ce6',
    specialties: [
      'Inteligência Artificial',
      'Agentes de IA e Multi Agentes',
      'Engenharia de IA Generativa',
      'Ciclo de Desenvolvimento com IA',
      'AIOps e Observabilidade Inteligente',
    ],
  },
  {
    key: 'dados',
    label: 'Dados',
    description: 'Organize e analise informações para descobrir padrões e ajudar pessoas e empresas a tomar decisões.',
    color: '#f4af3e',
    specialties: ['Engenharia de Dados', 'Ciência de dados', 'Análise de Dados'],
  },
  {
    key: 'infraestrutura',
    label: 'Infraestrutura',
    description: 'Mantenha redes, servidores, nuvem e serviços funcionando para que sistemas e aplicativos estejam disponíveis.',
    color: '#c9f4ee',
    specialties: [
      'Facilities em TI',
      'Infraestrutura Domain Controller on pre e hibrido',
      'Centro de Excelencia de Engenharia de Plataformas',
      'Observabilidade',
    ],
  },
  {
    key: 'gestao-e-agilidade',
    label: 'Gestão e Liderança',
    description: 'Organize projetos, facilite o trabalho das equipes e desenvolva habilidades de liderança em tecnologia.',
    color: '#f26430',
    specialties: [
      'Metodologia ágil',
      'Gestão e Liderança',
      'Tech Lead',
      'Liderança técnica',
      'Projetos',
      'Transição de carreira técnica para gestão liderança TI',
    ],
  },
  {
    key: 'produtos-e-negocios',
    label: 'Produtos e Negócios',
    description: 'Transforme necessidades e ideias em produtos digitais e negócios que criam valor para as pessoas.',
    color: '#8a1f96',
    specialties: ['Produtos (PO/PM)', 'Produtos digitais', 'Negócios', 'Empreendedora', 'Sustentabilidade'],
  },
  {
    key: 'carreira-em-ti',
    label: 'Carreira em TI',
    description: 'Descubra como começar, mudar de área ou crescer em tecnologia, incluindo comunicação e outras habilidades profissionais.',
    color: '#d98ce6',
    specialties: [
      'Carreira em TI',
      'Início de Profissão',
      'Transição de carreira para TI',
      'Transição de Carreira',
      'Transição de carreira da educação para TI',
      'Transição de carreira acadêmica para TI',
      'Transição de carreira antropóloga para TI',
      'Desenvolvimento de Carreira',
      'Comunicação',
      'Marketing Pessoal para início de carreira',
      'Atendimento ao público TI',
      'Soft Skills',
    ],
  },
] as const;

export const SPECIALTIES_BY_TRACK = KNOWLEDGE_TRACKS.map((track) => ({
  ...track,
  specialties: [...track.specialties].sort((a, b) => a.localeCompare(b, 'pt-BR')),
}));

export type KnowledgeTrackKey = (typeof KNOWLEDGE_TRACKS)[number]['key'];

function normalizeSpecialty(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

const specialtyTracks = new Map<string, KnowledgeTrackKey>(
  KNOWLEDGE_TRACKS.flatMap((track) => track.specialties.map((specialty) => [normalizeSpecialty(specialty), track.key] as const)),
);

const specialtyLabels = new Map<string, string>(
  KNOWLEDGE_TRACKS.flatMap((track) => track.specialties.map((specialty) => [normalizeSpecialty(specialty), specialty] as const)),
);

for (const [alias, corrected] of [
  ['Desenvolvimento', 'Desenvolvimento Full Stack'],
  ['Desenvolvimento de Software', 'Desenvolvimento Full Stack'],
  ['Desenvolvimento full stack', 'Desenvolvimento Full Stack'],
  ['Desenvolvimento Backend', 'Desenvolvimento Back-end'],
  ['Desenvolvimento Backend Java', 'Desenvolvimento Back-end'],
  ['Desenvolvimento Front-end', 'Desenvolvimento Front-end / UX'],
  ['Desenvolvimento UX', 'Desenvolvimento Front-end / UX'],
  ['UX', 'Desenvolvimento Front-end / UX'],
  ['Desendolvimento Front-end', 'Desenvolvimento Front-end / UX'],
  ['Desendolvimento Back-end', 'Desenvolvimento Back-end'],
  ['Engenharia Backend', 'Desenvolvimento Back-end'],
  ['Agilidade', 'Metodologia ágil'],
  ['Início de carreira', 'Início de Profissão'],
  ['Transição de carreira técnica para gestão e liderança em TI', 'Transição de carreira técnica para gestão liderança TI'],
] as const) {
  const normalizedAlias = normalizeSpecialty(alias);
  specialtyLabels.set(normalizedAlias, corrected);
  const trackKey = specialtyTracks.get(normalizeSpecialty(corrected));
  if (trackKey) specialtyTracks.set(normalizedAlias, trackKey);
}

export function canonicalSpecialty(value: string): string {
  return specialtyLabels.get(normalizeSpecialty(value)) ?? value.trim();
}

/** Enquadra os temas comerciais cadastrados da mentora nas trilhas correspondentes. */
export function trackKeysForSpecialties(specialties: readonly string[]): KnowledgeTrackKey[] {
  return [...new Set(specialties.flatMap((specialty) => {
    const key = specialtyTracks.get(normalizeSpecialty(specialty));
    return key ? [key] : [];
  }))];
}