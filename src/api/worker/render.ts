import { DEFAULT_WHATSAPP_LISTS, formatTimeBR } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, UserDoc, TableDoc } from '@tw/db';
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
  registration_cancelled: 'Sua inscrição na mentoria do Tech Woman foi cancelada',
  presence_confirmed: 'Presença confirmada',
  presence_cancelled: 'Sua mentoria foi cancelada',
  presence_unclear: 'Confirme sua presença',
  invite_closed: 'Convite não está mais disponível',
  invite_decline_link: 'Recuse o convite na sua página',
  invite_unclear: 'Responda ao convite',
};

const MOVED_DEFAULT = 'Sua mentoria foi remarcada: {horario} na {mesa} com {mentora}. Sua confirmação continua valendo.';

/**
 * Respostas à presença (RN18) e ao convite (RN20) e a inscrição cancelada pela participante: texto fixo no código
 * (UI-SPEC, Mensagens enviadas), não editável em A7.
 */
const FIXED: Record<string, string> = {
  presence_confirmed: 'Obrigada por confirmar, {nome}! Te esperamos às {horario} na {mesa}.',
  presence_cancelled: 'Tudo bem, {nome}. Sua mentoria das {horario} foi cancelada e você continua na fila com prioridade. Se quiser, escolha um novo horário aqui: {link}',
  presence_unclear: 'Não entendi. Responda SIM para confirmar ou NÃO para cancelar sua mentoria das {horario}.',
  invite_decline_link: 'Tudo bem, {nome}! Para recusar, conte o motivo na sua página: {link}. Se for o horário, você continua na fila com prioridade.',
  invite_closed: 'Este convite não está mais disponível. Veja como está sua inscrição: {link}',
  invite_unclear: 'Não entendi. Toque em Aceito ou Não posso, ou responda SIM ou NÃO.',
  registration_cancelled: 'Tudo certo, {nome}. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu. Se havia um horário marcado, ele foi liberado. Se mudar de ideia, é só se inscrever de novo: {link_inscricao}',
};

/**
 * List Messages (RN18 presença, RN20 convite): título e texto vêm de `events.whatsappLists` (A7); rodapé, botão e
 * opções ficam fixos, porque E47 decide pelo `rowId` e pelas palavras SIM/NÃO.
 */
const LIST_FOOTER = 'Se preferir, responda SIM ou NÃO';
const LIST_BUTTON = 'Responder';

export interface RenderInput {
  item: OutboxDoc;
  event: EventDoc;
  mentee: MenteeDoc | null;
  appointment: AppointmentDoc | null;
  mentor: UserDoc | null;
  table: TableDoc | null;
  /** Links curtos já resolvidos no worker (E48): `{link}` = `personal`. null sem participante. */
  links: { personal: string; calendar: string | null } | null;
  /** `PUBLIC_BASE_URL`: `{link_inscricao}` = `<baseUrl>/mentoria/inscricao` (sem token). */
  baseUrl: string;
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
    link: i.links?.personal ?? '',
    link_inscricao: `${i.baseUrl}/mentoria/inscricao`,
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  const lists = event.whatsappLists ?? DEFAULT_WHATSAPP_LISTS;
  if (i.list === 'invite' && a) {
    // sem {link} no texto editado, o link da página vai numa linha nova (PLAN, events.whatsappLists)
    const desc = lists.invite.description.includes('{link}') || !vars['link'] ? lists.invite.description : `${lists.invite.description}\nDetalhes: {link}`;
    const list: NotifierList = {
      title: fill(lists.invite.title),
      description: fill(desc),
      footer: LIST_FOOTER,
      button: LIST_BUTTON,
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
      title: fill(lists.presence.title),
      description: fill(lists.presence.description),
      footer: LIST_FOOTER,
      button: LIST_BUTTON,
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
  // todo link aponta para P6 pelo link curto (PLAN): garante que mensagens com agendamento tragam o link
  if (i.links && !text.includes(vars['link']!) && ['invite', 'confirmed', 'moved', 'cancelled', 'expired'].includes(item.type)) text += ` ${vars['link']}`;
  return { subject, text };
}
