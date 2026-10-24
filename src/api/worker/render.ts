import { formatTimeBR } from '@tw/shared';
import type { AppointmentDoc, EventDoc, MenteeDoc, OutboxDoc, UserDoc, TableDoc } from '@tw/db';
import { menteeToken, personalLink } from '../lib/tokens.js';

const SUBJECTS: Record<string, string> = {
  registered: 'Sua inscrição na mentoria Tech Woman',
  invite: 'Uma mentora quer te mentorar',
  confirmed: 'Mentoria confirmada',
  reminder: 'Sua mentoria começa em instantes',
  expired: 'O prazo para confirmar terminou',
  cancelled: 'Sua mentoria foi cancelada',
  moved: 'Sua mentoria mudou de horário',
};

const MOVED_DEFAULT = 'Sua mentoria foi remarcada: {horario} na {mesa} com {mentora}. Sua confirmação continua valendo.';

export interface RenderInput {
  item: OutboxDoc;
  event: EventDoc;
  mentee: MenteeDoc | null;
  appointment: AppointmentDoc | null;
  mentor: UserDoc | null;
  table: TableDoc | null;
  baseUrl: string;
  menteeTokenSecret: string;
}

export function render(i: RenderInput): { subject: string; text: string } {
  const { item, event } = i;
  const subject = SUBJECTS[item.type] ?? 'Tech Woman';
  const tpl = item.type === 'moved' ? MOVED_DEFAULT : (event.templates as Record<string, string>)[item.type] ?? '';
  const a = i.appointment;
  const vars: Record<string, string> = {
    nome: i.mentee?.name ?? '',
    mentora: i.mentor?.name ?? '',
    mesa: i.table ? (i.table.name ?? `Mesa ${i.table.number}`) : '',
    horario: a ? formatTimeBR(a.startAt, event.timezone) : '',
    prazo: a?.expiresAt ? formatTimeBR(a.expiresAt, event.timezone) : '',
    link: i.mentee ? personalLink(i.baseUrl, menteeToken(i.menteeTokenSecret, i.mentee._id, i.mentee.tokenVersion)) : '',
  };
  let text = tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  // todo link aponta para P6 (PLAN): garante que mensagens com agendamento tragam o link
  if (i.mentee && !text.includes(vars['link']!) && ['invite', 'confirmed', 'moved', 'cancelled', 'expired'].includes(item.type)) text += ` ${vars['link']}`;
  return { subject, text };
}
