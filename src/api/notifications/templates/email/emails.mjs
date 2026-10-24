// Conteúdo dos 6 e-mails (fonte única para o .html e o .txt). Textos e valores
// vêm de design/email/source/Emails.dc.html; todo dado de exemplo virou
// {{variavel}} conforme docs/PLAN.md, "Layouts de e-mail".

export const COMMON_VARS = ['evento_nome', 'evento_data', 'evento_local', 'link_privacidade', 'ano'];

const SELO = {
  neutro: ['#EFE8F0', '#3D0A45'],
  laranja: ['#FFE1D3', '#8A3210'],
  menta: ['#C9F4EE', '#1F4A44'],
  vermelho: ['#FBDADA', '#8A1C1C'],
  lilas: ['#D98CE6', '#3D0A45'],
};

export const EMAILS = [
  {
    id: '01-inscricao-recebida',
    vars: ['nome', 'link_minha_mentoria'],
    preheader: 'Acompanhe sua inscrição pela sua página pessoal.',
    selo: ['INSCRIÇÃO RECEBIDA', ...SELO.neutro],
    titulo: 'Oi, {{nome}}! Sua inscrição está ativa.',
    paragrafos: [
      'Recebemos sua inscrição na mentoria do Tech Woman.',
      'Assim que uma mentora da sua área escolher você, ela vai propor um horário e uma mesa. Você recebe o aviso por aqui e pelo WhatsApp e confirma pela sua página pessoal.',
    ],
    botao: ['Acompanhar minha mentoria', 'link_minha_mentoria'],
    nota: 'A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.',
    linkFallback: 'link_minha_mentoria',
  },
  {
    id: '02-convite-horario',
    vars: ['nome', 'mentora_nome', 'mentora_linkedin', 'mesa', 'horario', 'prazo', 'link_minha_mentoria'],
    preheader: 'Confirme até {{prazo}} para garantir seu horário.',
    selo: ['HORÁRIO PROPOSTO', ...SELO.laranja],
    titulo: 'Uma mentora quer te mentorar!',
    paragrafos: ['Oi, {{nome}}! [{{mentora_nome}}]({{mentora_linkedin}}) escolheu sua inscrição e propôs uma conversa de 40 minutos aqui no evento.'],
    card: [['MESA', '{{mesa}}'], ['HORÁRIO', '{{horario}}'], ['MENTORA', '{{mentora_nome}}']],
    destaque: 'Confirme até {{prazo}} (horário de Recife). Depois disso, o horário é liberado.',
    botao: ['Ver convite e confirmar', 'link_minha_mentoria'],
    nota: 'Se o horário não servir, recuse pela sua página: você volta para a fila com prioridade.',
    linkFallback: 'link_minha_mentoria',
  },
  {
    id: '03-confirmacao',
    vars: ['nome', 'mentora_nome', 'mesa', 'horario', 'link_minha_mentoria', 'link_agenda'],
    preheader: 'Chegue 5 minutos antes.',
    selo: ['CONFIRMADA', ...SELO.menta],
    titulo: 'Combinado, {{nome}}!',
    paragrafos: ['Sua mentoria está confirmada. Chegue 5 minutos antes na mesa indicada.'],
    card: [['MESA', '{{mesa}}'], ['HORÁRIO', '{{horario}}'], ['MENTORA', '{{mentora_nome}}']],
    botao: ['Adicionar à agenda', 'link_agenda'],
    sec: ['Ver minha mentoria', 'link_minha_mentoria'],
    nota: '{{evento_data}} · sessão de 40 minutos · horário de Recife.',
    linkFallback: 'link_minha_mentoria',
  },
  {
    id: '04-convite-expirado',
    vars: ['nome', 'link_minha_mentoria'],
    preheader: 'Sua inscrição continua ativa.',
    selo: ['EXPIRADA', ...SELO.vermelho],
    titulo: 'O prazo para confirmar terminou',
    paragrafos: [
      'Oi, {{nome}}. O prazo para confirmar o horário terminou e ele foi liberado.',
      'Sua inscrição continua ativa e você segue na fila. Avisamos assim que chegar um novo convite.',
    ],
    botao: ['Ver minha inscrição', 'link_minha_mentoria'],
    linkFallback: 'link_minha_mentoria',
  },
  {
    id: '05-cancelamento-mentora',
    vars: ['nome', 'horario', 'link_minha_mentoria'],
    preheader: 'Você voltou para a fila com prioridade.',
    selo: ['CANCELADA', ...SELO.vermelho],
    titulo: 'Sua mentoria foi cancelada',
    paragrafos: [
      'Oi, {{nome}}. A mentoria das {{horario}} precisou ser cancelada pela mentora.',
      'Você voltou para a fila com prioridade: as mentoras veem sua inscrição primeiro.',
    ],
    botao: ['Acompanhar minha mentoria', 'link_minha_mentoria'],
    linkFallback: 'link_minha_mentoria',
  },
  {
    id: '06-acesso-mentora',
    vars: ['mentora_nome', 'email_login', 'senha_provisoria', 'link_login', 'validade_senha'],
    preheader: 'Sua senha provisória está aqui.',
    selo: ['PARA MENTORAS', ...SELO.lilas],
    titulo: 'Boas-vindas, {{mentora_nome}}!',
    paragrafos: ['Obrigada por mentorar no Tech Woman. Este é o seu acesso à área da mentora, onde você monta sua disponibilidade e escolhe quem vai mentorar.'],
    card: [['LOGIN', '{{email_login}}'], ['SENHA PROVISÓRIA', '{{senha_provisoria}}']],
    destaque: 'No primeiro acesso você cria uma senha nova. A senha vale {{validade_senha}}.',
    botao: ['Entrar na área da mentora', 'link_login'],
    nota: 'Esqueceu a senha? Procure a organização no balcão de apoio.',
    linkFallback: 'link_login',
  },
];
