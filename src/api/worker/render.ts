import { formatTimeBR } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, UserDoc, TableDoc } from '@tw/db';
import { menteeToken, personalLink } from '../lib/tokens.js';
import { presenceMinutes, presenceRowId } from '../domain/index.js';
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
};

const MOVED_DEFAULT = 'Sua mentoria foi remarcada: {horario} na {mesa} com {mentora}. Sua confirmação continua valendo.';

/** Respostas à confirmação de presença (RN18): texto fixo no código (UI-SPEC, Mensagens enviadas), não editável em A7. */
const FIXED: Record<string, string> = {
  presence_confirmed: 'Obrigada por confirmar, {nome}! Te esperamos às {horario} na {mesa}.',
  presence_cancelled: 'Tudo bem, {nome}. Sua mentoria das {horario} foi cancelada e você continua na fila com prioridade. Se quiser, escolha um novo horário aqui: {link}',
  presence_unclear: 'Não entendi. Responda SIM para confirmar ou NÃO para cancelar sua mentoria das {horario}.',
};

/** List Message de presença (RN18, texto fixo): primeiro lembrete pelo WhatsApp. */
const PRESENCE_LIST = {
  title: 'Oi, {nome}!',
  description: 'Sua mentoria com {mentora} começa às {horario} na {mesa}: faltam {minutos} minutos. Você confirma sua presença?',
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
  /** Lembrete marcado com `payload.presenceCheck` e WhatsApp pelo WAHA: vai como List Message. */
  presenceList?: boolean;
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
  if (i.presenceList && a) {
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
