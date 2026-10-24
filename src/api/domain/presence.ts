import type { ReminderRuleInput } from './reminder.js';

/**
 * RN18 · Confirmação de presença pelo WhatsApp (WAHA). Funções puras usadas pelo worker (envio da List Message) e
 * pelo webhook E47 (leitura da resposta).
 */

export type PresenceAnswer = 'confirm' | 'cancel';

/** `whatsapp_inbound` guarda cada mensagem recebida por 7 dias (só para descartar o webhook repetido). */
export const WHATSAPP_INBOUND_TTL_DAYS = 7;

/** Minutos do texto ("faltam X minutos"), calculados no envio: `ceil((startAt − agora) / 60 s)`, no mínimo 1. */
export function presenceMinutes(startAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((startAt.getTime() - now.getTime()) / 60_000));
}

/**
 * Qual lembrete leva a List Message: o primeiro, pela ordem de envio, que sai pelo WhatsApp. Recebe a agenda de
 * `reminderSchedule` e se o WhatsApp está disponível para a participante (canal ligado e telefone), porque sem ele o
 * item vira e-mail em `channelsFor`. Devolve o `minutesBefore` desse lembrete, ou null se nenhum sai pelo WhatsApp.
 * Quem enfileira marca `payload.presenceCheck: true` só no item `whatsapp` dele; o gêmeo por e-mail fica comum.
 */
export function presenceReminderMinutes(
  schedule: readonly (ReminderRuleInput & { sendAt: Date })[],
  whatsappAvailable: boolean,
): number | null {
  if (!whatsappAvailable) return null;
  const first = [...schedule]
    .filter((r) => r.channels.includes('whatsapp'))
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())[0];
  return first ? first.minutesBefore : null;
}

// ---------------------------------------------------------------------------
// Opções da lista (`rowId`)
// ---------------------------------------------------------------------------

const ROW_ACTION = { confirm: 'confirmar', cancel: 'cancelar' } as const;
const ROW_RE = /^(confirmar|cancelar):([0-9a-f]{24})$/;

/** `rowId` das opções da List Message: `confirmar:<appointmentId>` e `cancelar:<appointmentId>`. */
export function presenceRowId(answer: PresenceAnswer, appointmentId: string): string {
  return `${ROW_ACTION[answer]}:${appointmentId}`;
}

/** Lê o `rowId` escolhido na lista; null se não for uma opção nossa. */
export function parsePresenceRowId(rowId: string | null | undefined): { answer: PresenceAnswer; appointmentId: string } | null {
  const m = ROW_RE.exec((rowId ?? '').trim());
  if (!m) return null;
  return { answer: m[1] === 'confirmar' ? 'confirm' : 'cancel', appointmentId: m[2]! };
}

// ---------------------------------------------------------------------------
// Resposta digitada
// ---------------------------------------------------------------------------

const SIM = new Set(['sim', 's', 'confirmo', 'confirmar', 'ok', '1']);
const NAO = new Set(['nao', 'n', 'cancelar', 'cancela', 'nao posso', '2']);
// Frase livre: sinais de sim/não no começo de alguma palavra (texto já sem acento).
const SINAIS_SIM = ['sim', 'confirm', 'estarei', 'vou sim', 'vou ir', 'pode contar', 'ok', 'beleza', 'claro', 'com certeza'];
const SINAIS_NAO = ['nao', 'cancel', 'desmarc', 'nem vou', 'impossivel', 'nao consigo'];
// Dúvida ou condição: não decide, pede SIM ou NÃO de novo.
const SINAIS_DUVIDA = ['nao sei', 'talvez', 'depende', 'acho que', 'mas ', 'atras', '?'];

/** Sem acento e sem nenhum outro caractere fora do ASCII (emoji some), minúsculo, sem `.`/`!` no fim. */
function normalizeText(text: string | null | undefined): string {
  const ascii = (text ?? '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  return ascii.trim().toLowerCase().replace(/[.!]+$/, '');
}

/**
 * Interpreta a resposta digitada: "confirm", "cancel" ou null (não entendido). Resposta exata (sim/não, 1/2) decide
 * na hora; dúvida ou sinais dos dois lados = não entendido.
 */
export function interpretPresenceText(text: string | null | undefined): PresenceAnswer | null {
  const t = normalizeText(text);
  if (SIM.has(t)) return 'confirm';
  if (NAO.has(t)) return 'cancel';
  if (SINAIS_DUVIDA.some((s) => t.includes(s))) return null;
  const padded = ` ${t} `;
  const yes = SINAIS_SIM.some((s) => padded.includes(` ${s}`));
  const no = SINAIS_NAO.some((s) => padded.includes(` ${s}`));
  if (yes && !no) return 'confirm';
  if (no && !yes) return 'cancel';
  return null;
}

// ---------------------------------------------------------------------------
// Evento do WAHA
// ---------------------------------------------------------------------------

/** `5511999999999:47@s.whatsapp.net` ou `5511999999999@c.us` → `5511999999999` (vazio se não houver). */
export function phoneFromWahaJid(jid: string | null | undefined): string {
  return (jid ?? '').split('@')[0]!.split(':')[0]!;
}

/** Id da mensagem do WAHA (`true_<chatId>_<hash>`) → `<hash>`, o identificador estável. */
export function wahaMessageHash(id: string): string {
  return id.split('_').pop() ?? id;
}

/** Campos do `payload` de `event: "message"` que E47 lê. */
export interface WahaMessageLike {
  id: string;
  from?: string | null;
  fromMe?: boolean | null;
  body?: string | null;
  _data?: {
    Info?: { SenderAlt?: string | null } | null;
    Message?: { listResponseMessage?: { singleSelectReply?: { selectedRowID?: string | null } | null } | null } | null;
  } | null;
}

/** Telefone de quem respondeu: `_data.Info.SenderAlt` (o `from` costuma vir como `@lid`) ou `from`. */
export function wahaSenderPhone(p: WahaMessageLike): string {
  return phoneFromWahaJid(p._data?.Info?.SenderAlt) || phoneFromWahaJid(p.from);
}

/**
 * Só mensagem recebida de contato em conversa 1:1: nem `fromMe`, nem de grupo (`@g.us`), Status
 * (`status@broadcast`), lista de transmissão (`@broadcast`) ou canal (`@newsletter`).
 */
export function isInboundContactMessage(event: string, p: Pick<WahaMessageLike, 'from' | 'fromMe'>): boolean {
  const from = p.from ?? '';
  return event === 'message' && !p.fromMe && /@(c\.us|s\.whatsapp\.net|lid)$/.test(from);
}

/** `rowId` escolhido na lista (`listResponseMessage.singleSelectReply.selectedRowID`); null se for texto. */
export function wahaListReplyRowId(p: WahaMessageLike): string | null {
  return p._data?.Message?.listResponseMessage?.singleSelectReply?.selectedRowID ?? null;
}
