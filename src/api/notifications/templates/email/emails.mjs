// Conteúdo dos 14 e-mails (fonte única para o .html e o .txt). Textos e valores
// vêm de design/email/source/Emails.dc.html; todo dado de exemplo virou
// {{variavel}} conforme docs/PLAN.md, "Layouts de e-mail". Trecho opcional:
// `{{#variavel}}...{{/variavel}}` some quando a variável vem vazia (render.ts).

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
      'Assim que uma mentora da sua área for atribuída a você, ela vai propor um horário e uma mesa. Você recebe o aviso por e-mail e confirma pela sua página pessoal.',
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
    paragrafos: ['Sua mentoria está confirmada. Chegue 5 minutos antes na mesa indicada.', 'Não vai conseguir ir? Pela sua página você cancela ou troca o horário.'],
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
    paraMentora: true,
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
  {
    id: '07-inscricao-cancelada',
    vars: ['nome', 'link_inscricao'],
    preheader: 'Se mudar de ideia, é só se inscrever de novo.',
    selo: ['INSCRIÇÃO CANCELADA', ...SELO.neutro],
    titulo: 'Sua inscrição foi cancelada',
    paragrafos: [
      'Tudo certo, {{nome}}. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu.',
      'Se havia um horário marcado, ele foi liberado.',
      'Se mudar de ideia, é só se inscrever de novo.',
    ],
    botao: ['Fazer nova inscrição', 'link_inscricao'],
    linkFallback: 'link_inscricao',
  },
  {
    id: '08-horario-liberado',
    vars: ['nome', 'horario', 'link_minha_mentoria'],
    preheader: 'Você continua na fila com prioridade.',
    selo: ['HORÁRIO LIBERADO', ...SELO.laranja],
    titulo: 'Seu horário foi liberado',
    paragrafos: [
      'Tudo bem, {{nome}}. O horário das {{horario}} foi liberado, como você pediu.',
      'Você continua na fila com prioridade: as mentoras veem sua inscrição primeiro. Se quiser, escolha outro horário livre pela sua página.',
    ],
    botao: ['Escolher outro horário', 'link_minha_mentoria'],
    linkFallback: 'link_minha_mentoria',
  },
  {
    // aviso à mentora (mentor_slot_released): {{motivo}} é a frase do motivo, montada no worker (message.ts)
    id: '09-aviso-mentora',
    paraMentora: true,
    vars: ['mentora_nome', 'nome', 'horario', 'mesa', 'link_painel', 'motivo'],
    preheader: 'O horário já aparece livre no seu painel.',
    selo: ['PARA MENTORAS', ...SELO.lilas],
    titulo: 'Seu horário das {{horario}} ficou livre',
    paragrafos: ['Oi, {{mentora_nome}}. {{motivo}}'],
    card: [['MESA', '{{mesa}}'], ['HORÁRIO', '{{horario}}'], ['PARTICIPANTE', '{{nome}}']],
    botao: ['Abrir minha agenda', 'link_painel'],
    nota: 'O horário já aparece livre no seu painel.',
    linkFallback: 'link_painel',
  },
  {
    // RN21 · atendida fora da mesa (walk_in_done): organização e LinkedIn da mentora são opcionais (trechos {{#...}})
    id: '10-atendimento-fora-da-mesa',
    vars: ['nome', 'mentora_nome', 'mentora_organizacao', 'mentora_linkedin', 'link_minha_mentoria'],
    preheader: 'Conte como foi a conversa com {{mentora_nome}}.',
    selo: ['ATENDIMENTO CONCLUÍDO', ...SELO.menta],
    titulo: 'Obrigada por participar, {{nome}}!',
    paragrafos: [
      'Você foi atendida por {{mentora_nome}}{{#mentora_organizacao}} ({{mentora_organizacao}}){{/mentora_organizacao}} fora das mesas, aqui no evento. Sua mentoria no Tech Woman está registrada como concluída.',
      'Na sua página pessoal você vê com quem conversou e avalia a mentoria. Leva menos de um minuto.',
    ],
    card: [['MENTORA', '{{mentora_nome}}']],
    botao: ['Ver minha página e avaliar', 'link_minha_mentoria'],
    // botão secundário só quando a mentora tem LinkedIn
    sec: ['Ver o LinkedIn de {{mentora_nome}}', 'mentora_linkedin'],
    secOpcional: true,
    nota: 'Sua avaliação ajuda a organização a melhorar as próximas edições.',
    linkFallback: 'link_minha_mentoria',
  },
  {
    // RN21 · atendimento fora da mesa removido pelo admin (walk_in_removed): a inscrição foi desfeita
    id: '11-atendimento-removido',
    vars: ['nome', 'link_inscricao'],
    preheader: 'Se ainda quiser a mentoria, faça uma nova inscrição.',
    selo: ['INSCRIÇÃO REMOVIDA', ...SELO.neutro],
    titulo: 'Sua inscrição foi removida',
    paragrafos: [
      'Oi, {{nome}}. A organização removeu o registro do seu atendimento fora da mesa e, com ele, sua inscrição na mentoria do Tech Woman.',
      'Se você ainda quer participar da mentoria, faça uma nova inscrição. Leva poucos minutos.',
    ],
    botao: ['Fazer nova inscrição', 'link_inscricao'],
    nota: 'Acha que foi um engano? Procure a organização no balcão de apoio.',
    linkFallback: 'link_inscricao',
  },
  {
    // RN24, RN19 · aviso à mentora (mentor_booked): uma participante agendou com ela; sem token da participante
    id: '12-mentoria-agendada',
    paraMentora: true,
    vars: ['mentora_nome', 'nome', 'horario', 'mesa', 'link_painel'],
    preheader: 'A mentoria já aparece na sua agenda.',
    selo: ['PARA MENTORAS', ...SELO.lilas],
    titulo: 'Nova mentoria às {{horario}}',
    paragrafos: ['Oi, {{mentora_nome}}. {{nome}} escolheu conversar com você às {{horario}}, na {{mesa}}.'],
    card: [['MESA', '{{mesa}}'], ['HORÁRIO', '{{horario}}'], ['PARTICIPANTE', '{{nome}}']],
    botao: ['Abrir minha agenda', 'link_painel'],
    nota: 'A mentoria já está confirmada e aparece na sua agenda.',
    linkFallback: 'link_painel',
  },
  {
    // RN25 · pedido de cancelamento da mentora às administradoras (mentor_cancel_request); {{justificativa}} é o
    // motivo escrito por ela em M6
    id: '13-pedido-cancelamento',
    paraAdmin: true,
    vars: ['mentora_nome', 'nome', 'horario', 'mesa', 'justificativa', 'link_painel'],
    preheader: '{{mentora_nome}} pede para cancelar a mentoria das {{horario}} com {{nome}}.',
    selo: ['PARA ADMINISTRADORAS', ...SELO.laranja],
    titulo: 'Pedido de cancelamento de mentoria',
    paragrafos: [
      '{{mentora_nome}} quer cancelar a mentoria das {{horario}} com {{nome}}, na {{mesa}}.',
      'O cancelamento pela mentora está desligado no painel, por isso só uma administradora pode fazer essa operação.',
    ],
    card: [['HORÁRIO', '{{horario}}'], ['MENTORA', '{{mentora_nome}}'], ['PARTICIPANTE', '{{nome}}']],
    destaque: 'Motivo: {{justificativa}}',
    botao: ['Abrir o mapa de mesas', 'link_painel'],
    nota: 'Se cancelar, a participante volta para a fila com prioridade e recebe o aviso por e-mail.',
    linkFallback: 'link_painel',
  },
  {
    // RN26 · a mentora incluiu ou tirou horários da própria disponibilidade (mentor_availability_changed), às
    // administradoras; as listas vêm prontas do worker ("nenhum" quando vazia)
    id: '14-disponibilidade-mentora',
    paraAdmin: true,
    vars: ['mentora_nome', 'horarios_incluidos', 'horarios_retirados', 'quando', 'link_painel'],
    preheader: '{{mentora_nome}} mudou a própria disponibilidade em {{quando}}.',
    selo: ['PARA ADMINISTRADORAS', ...SELO.laranja],
    titulo: '{{mentora_nome}} mudou a disponibilidade',
    paragrafos: [
      '{{mentora_nome}} alterou a própria disponibilidade pelo painel da mentora em {{quando}} (horário de Recife). Isso muda os horários em que ela pode receber mentorias.',
    ],
    card: [['INCLUIU', '{{horarios_incluidos}}'], ['TIROU', '{{horarios_retirados}}'], ['QUANDO', '{{quando}}']],
    botao: ['Ver as mentoras', 'link_painel'],
    nota: 'A alteração também fica registrada em Logs > Auditoria.',
    linkFallback: 'link_painel',
  },
];
