import { API_PREFIX, formatTimeBR, type OutboxType } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, TableDoc, UserDoc } from '@tw/db';
import { menteeToken, personalLink } from '../lib/tokens.js';
import type { NotifierAttachment } from '../worker/notifier.js';
import { buildIcs, ICS_FILENAME, tableLabel } from './ics.js';
import { renderEmail, RenderError, type RenderedEmail } from './render.js';
import { emailSubjectFor, EMAIL_TEMPLATE_BY_OUTBOX_TYPE, type EmailOutboxType } from './templates/email/subjects.js';

export interface EmailMessageInput {
  item: Pick<OutboxDoc, 'type'>;
  event: EventDoc;
  mentee: MenteeDoc | null;
  appointment: AppointmentDoc | null;
  /** Mentora da mentoria (layouts 2 e 3). */
  mentor: UserDoc | null;
  table: TableDoc | null;
  /** Destinatária do layout 6. */
  staffUser: UserDoc | null;
  /** Senha provisória já decifrada (layout 6). */
  provisionalPassword: string | null;
  baseUrl: string;
  menteeTokenSecret: string;
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
  if (mentee) {
    const token = menteeToken(i.menteeTokenSecret, mentee._id, mentee.tokenVersion);
    vars['nome'] = mentee.name;
    vars['link_minha_mentoria'] = personalLink(i.baseUrl, token);
    vars['link_agenda'] = `${i.baseUrl}${API_PREFIX}/public/calendar.ics?t=${token}`;
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
  // assunto editado em A7 vale para o layout; moved e reminder mantêm as variantes próprias do layout 3
  const custom = type === 'moved' || type === 'reminder' ? undefined : event.emailSubjects?.[layout];
  const rendered = renderEmail(layout, vars, custom ?? emailSubjectFor(type));
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
