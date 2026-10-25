import { randomInt } from 'node:crypto';
import type { Collection } from 'mongodb';
import { API_PREFIX, zonedTimeToUtc } from '@tw/shared';
import type { EventDoc, MenteeDoc, ShortLinkDoc, ShortLinkKind } from '@tw/db';
import { isDuplicateKey } from './errors.js';
import { menteeToken, personalPath } from './tokens.js';

/** Links curtos `/l/<código>` (E48; PLAN, Notificações > Links curtos). O código é credencial, como o token. */
export const SHORT_LINK_CODE_LENGTH = 7;
export const SHORT_LINK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_LINK_MAX_ATTEMPTS = 5;
/** O link vale até 7 dias depois do fim do evento. */
export const SHORT_LINK_DAYS_AFTER_EVENT = 7;

/** `expireAt` dos links: `date` + `endTime` no fuso do evento, mais 7 dias. */
export function shortLinkExpireAt(event: Pick<EventDoc, 'date' | 'endTime' | 'timezone'>): Date {
  return new Date(zonedTimeToUtc(event.date, event.endTime, event.timezone).getTime() + SHORT_LINK_DAYS_AFTER_EVENT * 86_400_000);
}

const CODE_RE = new RegExp(`^[0-9A-Za-z]{${SHORT_LINK_CODE_LENGTH}}$`);

/** Destino de código inexistente, inválido ou revogado: P6 mostra "Link inválido". */
export const SHORT_LINK_INVALID_TARGET = '/mentoria/minha';

/** 7 caracteres base62, cada um com `crypto.randomInt` (sem viés de módulo). */
export function newShortLinkCode(): string {
  let s = '';
  for (let i = 0; i < SHORT_LINK_CODE_LENGTH; i++) s += SHORT_LINK_ALPHABET[randomInt(SHORT_LINK_ALPHABET.length)];
  return s;
}

export const isShortLinkCode = (code: string) => CODE_RE.test(code);

type ShortLinks = Pick<Collection<ShortLinkDoc>, 'findOne' | 'insertOne'>;

/**
 * Get-or-create pelo índice único `short_link_mentee_kind_version`: reenviar o link devolve o mesmo código.
 * Duplicate key: se já existe o link da participante (corrida), usa ele; senão foi o `_id` (código já usado) e
 * sorteia outro, até 5 tentativas. Fora de transação (duplicate key abortaria a transação).
 */
export async function getOrCreateShortLink(
  c: { shortLinks: ShortLinks },
  mentee: Pick<MenteeDoc, '_id' | 'tokenVersion'>,
  kind: ShortLinkKind,
  expireAt: Date,
  now: Date = new Date(),
): Promise<string> {
  const key = { menteeId: mentee._id, kind, tokenVersion: mentee.tokenVersion };
  const found = await c.shortLinks.findOne(key, { projection: { _id: 1 } });
  if (found) return found._id;
  for (let i = 0; i < SHORT_LINK_MAX_ATTEMPTS; i++) {
    const code = newShortLinkCode();
    try {
      await c.shortLinks.insertOne({ _id: code, ...key, createdAt: now, expireAt });
      return code;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const winner = await c.shortLinks.findOne(key, { projection: { _id: 1 } });
      if (winner) return winner._id;
    }
  }
  throw new Error('link curto: não foi possível gerar um código único');
}

export const shortPath = (code: string) => `/l/${code}`;

export function shortLink(baseUrl: string, code: string): string {
  return `${baseUrl}${shortPath(code)}`;
}

/**
 * Destino relativo do 302 de E48. O token é derivado na hora pelo `tokenVersion` atual; link de outra versão, vencido
 * ou de participante que não existe mais vai para o destino inválido, igual a um código desconhecido.
 */
export async function resolveShortLink(
  c: { shortLinks: Pick<Collection<ShortLinkDoc>, 'findOne'>; mentees: Pick<Collection<MenteeDoc>, 'findOne'> },
  secret: string,
  code: string,
  now: Date = new Date(),
): Promise<string> {
  if (!isShortLinkCode(code)) return SHORT_LINK_INVALID_TARGET;
  const link = await c.shortLinks.findOne({ _id: code });
  // o TTL do MongoDB apaga com atraso de até um minuto
  if (!link || link.expireAt <= now) return SHORT_LINK_INVALID_TARGET;
  const mentee = await c.mentees.findOne({ _id: link.menteeId }, { projection: { _id: 1, tokenVersion: 1 } });
  if (!mentee || mentee.tokenVersion !== link.tokenVersion) return SHORT_LINK_INVALID_TARGET;
  const token = menteeToken(secret, mentee._id, mentee.tokenVersion);
  return link.kind === 'calendar' ? `${API_PREFIX}/public/calendar.ics?t=${token}` : personalPath(token);
}
