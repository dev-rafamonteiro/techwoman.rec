import { ObjectId } from "mongodb";
import { DEFAULT_AREAS } from "../../src/db/event.js";

/** Massa da busca (PLAN, "Campos de busca"): 30 participantes e 10 mentoras, textos em português, sem contato nos campos de busca. */
export const EVENT_ID = "techwoman-2026";
export const areaLabel = (key: string) => DEFAULT_AREAS.find((a) => a.key === key)!.label;

/** Comentário que o teste semântico deve encontrar a partir de "quero migrar para dados". */
export const MIGRACAO_NOTE = "Estou numa mudança de carreira para análise de dados, vim da contabilidade e quero aprender SQL e visualização.";
export const MIGRACAO_NAME = "Helena Vasconcelos";

interface Seed {
  name: string;
  area: string;
  note: string;
  status?: "waiting" | "invited";
  priority?: boolean;
}

const MENTEES: Seed[] = [
  { name: MIGRACAO_NAME, area: "dados", note: MIGRACAO_NOTE },
  { name: "Joana Albuquerque", area: "backend", note: "Estou em transição de carreira vinda da área de saúde e quero entender por onde começar em programação." },
  { name: "Mariana Teixeira", area: "frontend", note: "Trabalho com suporte e quero migrar para desenvolvimento de interfaces com React." },
  { name: "Beatriz Nogueira", area: "ux", note: "Sou designer gráfica e desejo me aprofundar em pesquisa com usuários e prototipação." },
  { name: "Camila Ferreira", area: "produto", note: "Sou analista de negócios e quero virar gerente de produto, preciso de ajuda com priorização de backlog." },
  { name: "Larissa Medeiros", area: "cloud", note: "Quero aprender a montar infraestrutura na nuvem, containers e pipelines de entrega contínua." },
  { name: "Fernanda Lima", area: "backend", note: "Escrevo APIs em Java há dois anos e busco orientação para evoluir para arquitetura de microsserviços." },
  { name: "Aline Cavalcanti", area: "dados", note: "Faço relatórios em planilhas e quero aprender Python e estatística para virar cientista de dados." },
  { name: "Juliana Pessoa", area: "dados", note: "Curso engenharia de dados e tenho dúvidas sobre pipelines, Spark e modelagem dimensional." },
  { name: "Patrícia Santana", area: "frontend", note: "Quero melhorar a acessibilidade dos sites que desenvolvo e aprender testes automatizados." },
  { name: "Renata Barbosa", area: "ux", note: "Estou terminando um curso de UX e preciso de feedback sobre meu portfólio." },
  { name: "Luciana Moura", area: "produto", note: "Lidero um time pequeno e quero aprender a definir métricas de produto e roadmap." },
  { name: "Vanessa Lacerda", area: "cloud", note: "Quero me preparar para a certificação de arquiteta de soluções em nuvem." },
  { name: "Tatiane Oliveira", area: "backend", note: "Recém-formada, procuro dicas de como me destacar na primeira vaga como desenvolvedora." },
  { name: "Isabela Rangel", area: "dados", note: "Tenho interesse em inteligência artificial e aprendizado de máquina aplicados à saúde." },
  { name: "Gabriela Figueiredo", area: "frontend", note: "Estou voltando ao mercado depois de uma pausa de três anos e quero atualizar meus conhecimentos." },
  { name: "Daniela Freitas", area: "ux", note: "Quero entender como trabalhar bem com desenvolvedores na entrega de interfaces." },
  { name: "Simone Arruda", area: "produto", note: "Venho do marketing e quero entrar em gestão de produtos digitais." },
  { name: "Cláudia Menezes", area: "cloud", note: "Administro servidores e desejo automatizar com infraestrutura como código." },
  { name: "Sandra Queiroz", area: "backend", note: "Quero ajuda para estruturar bancos de dados e melhorar o desempenho de consultas." },
  { name: "Bruna Carvalho", area: "dados", note: "Trabalho com dashboards e quero evoluir para análise preditiva." },
  { name: "Elaine Rocha", area: "frontend", note: "Estou aprendendo TypeScript e gostaria de conversar sobre carreira em tecnologia." },
  { name: "Michele Duarte", area: "backend", note: "Quero liderar tecnicamente e preciso de conselhos sobre a carreira de engenheira sênior." },
  { name: "Paula Siqueira", area: "ux", note: "Tenho dificuldade em apresentar minhas ideias de design para a diretoria." },
  { name: "Raquel Bezerra", area: "dados", note: "Sou da área jurídica e estou pensando em uma transição para ciência de dados." },
  { name: "Viviane Coutinho", area: "cloud", note: "Preciso de orientação sobre segurança em ambientes de nuvem e conformidade." },
  { name: "Adriana Pinheiro", area: "produto", note: "Quero entender discovery contínuo e pesquisa de mercado para startups." },
  { name: "Carolina Veloso", area: "frontend", note: "Sou desenvolvedora júnior e busco uma mentora para revisar meu código e meus projetos." },
  { name: "Débora Tavares", area: "backend", note: "Estou migrando de PHP para Node e quero conversar sobre boas práticas de testes." },
  { name: "Eliane Prado", area: "dados", note: "Já fui convidada e já tenho horário marcado; aprendizado de máquina é meu foco.", status: "invited", priority: true },
];

export interface MenteeSeed {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  area: string;
  note: string;
  status: "waiting" | "invited";
  priority: boolean;
}

/** `prefix` evita colisão de e-mail/telefone entre execuções. */
export function buildMentees(): MenteeSeed[] {
  return MENTEES.map((m, i) => ({
    _id: new ObjectId(),
    name: m.name,
    email: `busca.participante${i + 1}@exemplo.test`,
    phone: `+5581988${String(100000 + i)}`,
    area: m.area,
    note: m.note,
    status: m.status ?? "waiting",
    priority: m.priority ?? false,
  }));
}

export interface MentorSeed {
  _id: ObjectId;
  name: string;
  email: string;
  areas: string[];
  bio: string;
  status: "active" | "disabled";
  roles: string[];
}

const MENTORS: { name: string; areas: string[]; bio: string }[] = [
  { name: "Amanda Siqueira", areas: ["dados"], bio: "Cientista de dados sênior, ajudo mulheres em transição de carreira para análise de dados e aprendizado de máquina." },
  { name: "Roberta Guimarães", areas: ["backend", "cloud"], bio: "Engenheira de software com foco em arquitetura de microsserviços e plataformas de nuvem." },
  { name: "Telma Borges", areas: ["frontend", "ux"], bio: "Desenvolvedora front-end apaixonada por acessibilidade e design de interfaces." },
  { name: "Cristiane Lobo", areas: ["produto"], bio: "Gerente de produto com experiência em startups, métricas, discovery e priorização." },
  { name: "Mônica Aragão", areas: ["ux"], bio: "Designer de produto, pesquisa com usuários e construção de portfólio." },
  { name: "Silvia Montenegro", areas: ["cloud"], bio: "Especialista em infraestrutura como código, containers e segurança em nuvem." },
  { name: "Lúcia Andrade", areas: ["backend"], bio: "Liderança técnica, bancos de dados e desempenho de consultas." },
  { name: "Ingrid Holanda", areas: ["dados", "produto"], bio: "Analista de dados que migrou para produto; mentoria em carreira e indicadores." },
  { name: "Heloísa Dantas", areas: ["frontend"], bio: "" },
  { name: "Olívia Ramos", areas: ["backend", "dados"], bio: "Engenheira de dados, pipelines e modelagem dimensional." },
];

export function buildMentors(): MentorSeed[] {
  return MENTORS.map((m, i) => ({
    _id: new ObjectId(),
    name: m.name,
    email: `busca.mentora${i + 1}@techwoman.test`,
    roles: ["mentor"],
    status: i === 9 ? "disabled" : "active",
    areas: m.areas,
    bio: m.bio,
  }));
}
