// Assuntos dos e-mails (docs/PLAN.md, "Layouts de e-mail"). Placeholders {{variavel}}
// são preenchidos pelo worker; em A7 só os assuntos são editáveis (sobrescrevem estes padrões).

export const EMAIL_TEMPLATE_IDS = [
  '01-inscricao-recebida',
  '02-convite-horario',
  '03-confirmacao',
  '04-convite-expirado',
  '05-cancelamento-mentora',
  '06-acesso-mentora',
  '07-inscricao-cancelada',
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

/** Variáveis comuns a todos os layouts. */
export const EMAIL_COMMON_VARS = ['evento_nome', 'evento_data', 'evento_local', 'link_privacidade', 'ano'] as const;

/** Variáveis próprias de cada layout (tabela do PLAN); `{{...}}` do layout e do assunto usam só estas + as comuns. */
export const EMAIL_TEMPLATE_VARS = {
  '01-inscricao-recebida': ['nome', 'link_minha_mentoria'],
  '02-convite-horario': ['nome', 'mentora_nome', 'mentora_linkedin', 'mesa', 'horario', 'prazo', 'link_minha_mentoria'],
  '03-confirmacao': ['nome', 'mentora_nome', 'mesa', 'horario', 'link_minha_mentoria', 'link_agenda'],
  '04-convite-expirado': ['nome', 'link_minha_mentoria'],
  '05-cancelamento-mentora': ['nome', 'horario', 'link_minha_mentoria'],
  '06-acesso-mentora': ['mentora_nome', 'email_login', 'senha_provisoria', 'link_login', 'validade_senha'],
  '07-inscricao-cancelada': ['nome', 'link_inscricao'],
} as const satisfies Record<EmailTemplateId, readonly string[]>;

/** Tipo da `outbox` -> layout. */
export const EMAIL_TEMPLATE_BY_OUTBOX_TYPE = {
  registered: '01-inscricao-recebida',
  invite: '02-convite-horario',
  confirmed: '03-confirmacao',
  moved: '03-confirmacao',
  reminder: '03-confirmacao',
  expired: '04-convite-expirado',
  cancelled: '05-cancelamento-mentora',
  staff_password: '06-acesso-mentora',
  registration_cancelled: '07-inscricao-cancelada',
} as const satisfies Record<string, EmailTemplateId>;

export type EmailOutboxType = keyof typeof EMAIL_TEMPLATE_BY_OUTBOX_TYPE;

/** Assunto padrão de cada layout. */
export const EMAIL_SUBJECTS: Record<EmailTemplateId, string> = {
  '01-inscricao-recebida': 'Recebemos sua inscrição na mentoria do Tech Woman',
  '02-convite-horario': '{{mentora_nome}} quer te mentorar às {{horario}}',
  '03-confirmacao': 'Combinado: {{horario}} na {{mesa}}',
  '04-convite-expirado': 'O prazo para confirmar sua mentoria terminou',
  '05-cancelamento-mentora': 'Sua mentoria das {{horario}} foi cancelada',
  '06-acesso-mentora': 'Seu acesso ao painel de mentoras do Tech Woman',
  '07-inscricao-cancelada': 'Sua inscrição na mentoria do Tech Woman foi cancelada',
};

/** Variantes do layout 3 por tipo da `outbox`. */
export const EMAIL_SUBJECT_VARIANTS = {
  moved: 'Sua mentoria mudou',
  reminder: 'Sua mentoria começa às {{horario}}',
} as const;

/** Assunto padrão (com placeholders) para um tipo da `outbox`. */
export function emailSubjectFor(type: EmailOutboxType): string {
  if (type === 'moved' || type === 'reminder') return EMAIL_SUBJECT_VARIANTS[type];
  return EMAIL_SUBJECTS[EMAIL_TEMPLATE_BY_OUTBOX_TYPE[type]];
}
