import { formatTimeBR } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, UserDoc, TableDoc } from '@tw/db';
import { menteeToken, personalLink } from '../lib/tokens.js';
import { inviteRowId, presenceMinutes, presenceRowId } from '../domain/index.js';
import type { NotifierList } from './notifier.js';

const SUBJECTS: Record<string, string> = {
  registered: 'Sua inscrição na mentoria Tech Woman',
  invite: 'Uma mentora quer te mentorar',
  confirmed: 'Mentoria confirmada',
  reminder: 'Sua mentoria começa em instantes',
  expired: 'O prazo para confirmar terminou',
  cancelled: 'Sua mentoria foi cancelada',
  moved: 'Sua mentoria mudou de horário',
  presence_confirmed: 'Presença confirmada',
  presence_cancelled: 'Sua mentoria foi cancelada',
  presence_unclear: 'Confirme sua presença',
  invite_closed: 'Convite não está mais disponível',
  invite_decline_link: 'Recuse o convite na sua página',
  invite_unclear: 'Responda ao convite',
};

const MOVED_DEFAULT = 'Sua mentoria foi remarcada: {horario} na {mesa} com {mentora}. Sua confirmação continua valendo.';

/** Respostas à presença (RN18) e ao convite (RN20): texto fixo no código (UI-SPEC, Mensagens enviadas), não editável em A7. */
const FIXED: Record<string, string> = {
  presence_confirmed: 'Obrigada por confirmar, {nome}! Te esperamos às {horario} na {mesa}.',
  presence_cancelled: 'Tudo bem, {nome}. Sua mentoria das {horario} foi cancelada e você continua na fila com prioridade. Se quiser, escolha um novo horário aqui: {link}',
  presence_unclear: 'Não entendi. Responda SIM para confirmar ou NÃO para cancelar sua mentoria das {horario}.',
  invite_decline_link: 'Tudo bem, {nome}! Para recusar, conte o motivo na sua página: {link}. Se for o horário, você continua na fila com prioridade.',
  invite_closed: 'Este convite não está mais disponível. Veja como está sua inscrição: {link}',
  invite_unclear: 'Não entendi. Toque em Aceito ou Não posso, ou responda SIM ou NÃO.',
};

/** List Message de presença (RN18, texto fixo): primeiro lembrete pelo WhatsApp. */
const PRESENCE_LIST = {
  title: 'Oi, {nome}!',
  description: 'Sua mentoria com {mentora} começa às {horario} na {mesa}: faltam {minutos} minutos. Você confirma sua presença?',
  footer: 'Se preferir, responda SIM ou NÃO',
  button: 'Responder',
};

/** List Message do convite (RN20, texto fixo): item `whatsapp` do `invite`. */
const INVITE_LIST = {
  title: 'Oi, {nome}!',
  description: '{mentora} quer te mentorar às {horario}, na {mesa}. Você aceita? Responda até {prazo}.\nDetalhes: {link}',
  footer: 'Se preferir, responda SIM ou NÃO',
  button: 'Responder',
};

export interface RenderInput {
  item: OutboxDoc;
  event: EventDoc;
  mentee: MenteeDoc | null;
  appointment: AppointmentDoc | null;
  mentor: UserDoc | null;
  table: TableDoc | null;
  baseUrl: string;
  menteeTokenSecret: string;
  /** Hora do envio: `{minutos}` do lembrete é calculado agora (RN18). */
  now: Date;
  /**
   * WhatsApp pelo WAHA como List Message: `presence` = lembrete marcado com `payload.presenceCheck` (RN18);
   * `invite` = convite (RN20).
   */
  list?: 'presence' | 'invite';
}

export function render(i: RenderInput): { subject: string; text: string; list?: NotifierList } {
  const { item, event } = i;
  const subject = SUBJECTS[item.type] ?? 'Tech Woman';
  const tpl = item.type === 'moved' ? MOVED_DEFAULT : FIXED[item.type] ?? (event.templates as Record<string, string>)[item.type] ?? '';
  const a = i.appointment;
  const vars: Record<string, string> = {
    nome: i.mentee?.name ?? '',
    mentora: i.mentor?.name ?? '',
    mesa: i.table ? (i.table.name ?? `Mesa ${i.table.number}`) : '',
    horario: a ? formatTimeBR(a.startAt, event.timezone) : '',
    prazo: a?.expiresAt ? formatTimeBR(a.expiresAt, event.timezone) : '',
    minutos: a ? String(presenceMinutes(a.startAt, i.now)) : '',
    link: i.mentee ? personalLink(i.baseUrl, menteeToken(i.menteeTokenSecret, i.mentee._id, i.mentee.tokenVersion)) : '',
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  if (i.list === 'invite' && a) {
    const list: NotifierList = {
      title: fill(INVITE_LIST.title),
      description: fill(INVITE_LIST.description),
      footer: INVITE_LIST.footer,
      button: INVITE_LIST.button,
      sections: [{
        title: 'Convite',
        rows: [
          { title: 'Aceito', rowId: inviteRowId('confirm', a._id.toHexString()), description: null },
          { title: 'Não posso', rowId: inviteRowId('cancel', a._id.toHexString()), description: 'Você conta o motivo na sua página' },
        ],
      }],
    };
    return { subject, text: `${list.title} ${list.description}`, list };
  }
  if (i.list === 'presence' && a) {
    const list: NotifierList = {
      title: fill(PRESENCE_LIST.title),
      description: fill(PRESENCE_LIST.description),
      footer: PRESENCE_LIST.footer,
      button: PRESENCE_LIST.button,
      sections: [{
        title: 'Confirmação',
        rows: [
          { title: 'Sim, confirmo', rowId: presenceRowId('confirm', a._id.toHexString()), description: null },
          { title: 'Não poderei ir', rowId: presenceRowId('cancel', a._id.toHexString()), description: 'Você poderá escolher outro horário' },
        ],
      }],
    };
    return { subject, text: `${list.title} ${list.description}`, list };
  }
  let text = fill(tpl);
  // todo link aponta para P6 (PLAN): garante que mensagens com agendamento tragam o link
  if (i.mentee && !text.includes(vars['link']!) && ['invite', 'confirmed', 'moved', 'cancelled', 'expired'].includes(item.type)) text += ` ${vars['link']}`;
  return { subject, text };
}
