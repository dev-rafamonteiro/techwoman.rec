import { formatTimeBR, isMentorSlotReleasedReason, MENTOR_SLOT_RELEASED_TEXT, type MentorSlotReleasedReason, type OutboxType } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, TableDoc, UserDoc } from '@tw/db';
import type { NotifierAttachment } from '../worker/notifier.js';
import { buildIcs, ICS_FILENAME, tableLabel } from './ics.js';
import { renderEmail, RenderError, type RenderedEmail } from './render.js';
import { emailSubjectFor, EMAIL_TEMPLATE_BY_OUTBOX_TYPE, type EmailOutboxType } from './templates/email/subjects.js';

export interface EmailMessageInput {
  /** `payload.reason` escolhe o assunto e o `motivo` do layout 9 (aviso à mentora). */
  item: Pick<OutboxDoc, 'type'> & { payload?: OutboxDoc['payload'] };
  event: EventDoc;
  /** Participante; no aviso à mentora, a da mentoria (só para `nome`, sem links). */
  mentee: MenteeDoc | null;
  appointment: AppointmentDoc | null;
  /** Mentora da mentoria (layouts 2, 3 e 9). */
  mentor: UserDoc | null;
  table: TableDoc | null;
  /** Destinatária do layout 6. */
  staffUser: UserDoc | null;
  /** Senha provisória já decifrada (layout 6). */
  provisionalPassword: string | null;
  baseUrl: string;
  /**
   * Links curtos já resolvidos no worker (E48): `personal` = `link_minha_mentoria`, `calendar` = `link_agenda`
   * (só confirmed, moved e reminder). null sem participante.
   */
  links: { personal: string; calendar: string | null } | null;
  tempPasswordHours: number;
  /** UID e SEQUENCE do `.ics` anexado (`icsIdentity`). */
  ics: { uid: string; sequence: number };
}

export interface EmailMessage extends RenderedEmail {
  attachments: NotifierAttachment[];
}

/** "Sábado, 14 de novembro de 2026" a partir de `YYYY-MM-DD`. */
export function formatEventDate(date: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isEmailType = (t: OutboxType): t is EmailOutboxType => t in EMAIL_TEMPLATE_BY_OUTBOX_TYPE;

/** Layout 9: frase do motivo (`{{motivo}}`), a mesma do WhatsApp (`MENTOR_SLOT_RELEASED_TEXT`). */
function mentorMotivo(reason: MentorSlotReleasedReason, v: Record<string, string>): string {
  return `${MENTOR_SLOT_RELEASED_TEXT[reason].replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)}.`;
}

/** Monta assunto, HTML, texto e anexo de um e-mail da outbox. Variável que falta vira `RenderError`. */
export function buildEmailMessage(i: EmailMessageInput): EmailMessage {
  const type = i.item.type;
  if (!isEmailType(type)) throw new RenderError(`tipo sem layout de e-mail: ${type}`);
  const layout = EMAIL_TEMPLATE_BY_OUTBOX_TYPE[type];
  const { event, appointment: a, mentee } = i;
  const tz = event.timezone;
  const vars: Record<string, string | undefined> = {
    evento_nome: event.name,
    evento_data: formatEventDate(event.date),
    evento_local: event.location ?? '',
    link_privacidade: `${i.baseUrl}/privacidade`,
    ano: event.date.slice(0, 4),
  };
  if (mentee) vars['nome'] = mentee.name;
  if (i.links) {
    vars['link_minha_mentoria'] = i.links.personal;
    if (i.links.calendar) vars['link_agenda'] = i.links.calendar;
  }
  if (a) {
    vars['horario'] = formatTimeBR(a.startAt, tz);
    if (a.expiresAt) vars['prazo'] = formatTimeBR(a.expiresAt, tz);
  }
  if (i.mentor) {
    vars['mentora_nome'] = i.mentor.name;
    vars['mentora_linkedin'] = i.mentor.linkedin ?? '';
  }
  if (i.table) vars['mesa'] = tableLabel(i.table);
  if (layout === '06-acesso-mentora') {
    vars['mentora_nome'] = i.staffUser?.name;
    vars['email_login'] = i.staffUser?.email;
    vars['senha_provisoria'] = i.provisionalPassword ?? undefined;
    vars['link_login'] = `${i.baseUrl}/entrar`;
    vars['validade_senha'] = `${i.tempPasswordHours} horas`;
  }
  // layout 7: nova inscrição em P4, sem token (E02 reativa a inscrição cancelada)
  if (layout === '07-inscricao-cancelada') vars['link_inscricao'] = `${i.baseUrl}/mentoria/inscricao`;
  // layout 9: painel da mentora (M1, sem token) e a frase do motivo; motivo desconhecido é erro de renderização
  let reason: MentorSlotReleasedReason | undefined;
  if (layout === '09-aviso-mentora') {
    const r = i.item.payload?.['reason'];
    if (!isMentorSlotReleasedReason(r)) throw new RenderError(`motivo desconhecido: ${String(r)}`);
    reason = r;
    vars['link_painel'] = `${i.baseUrl}/entrar`;
    if (vars['nome'] !== undefined && vars['horario'] !== undefined && vars['mesa'] !== undefined) {
      vars['motivo'] = mentorMotivo(r, { nome: vars['nome'], horario: vars['horario'], mesa: vars['mesa'] });
    }
  }
  // assunto editado em A7 vale para o layout; moved e reminder mantêm as variantes próprias do layout 3 e, no layout 9,
  // os motivos que não são o padrão (`confirmed_cancelled`) mantêm as variantes próprias
  const variant = type === 'moved' || type === 'reminder' || (reason !== undefined && reason !== 'confirmed_cancelled');
  const custom = variant ? undefined : event.emailSubjects?.[layout];
  const rendered = renderEmail(layout, vars, custom ?? emailSubjectFor(type, reason));
  const attachments: NotifierAttachment[] = [];
  if (layout === '03-confirmacao' && a && i.mentor && i.table) {
    attachments.push({
      filename: ICS_FILENAME,
      contentType: 'text/calendar; method=PUBLISH; charset=utf-8',
      content: buildIcs({ appointment: a, event, mentor: i.mentor, table: i.table, uid: i.ics.uid, sequence: i.ics.sequence }),
    });
  }
  return { ...rendered, attachments };
}
