import type { MenteeDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { AppError } from './errors.js';
import { hashMenteeToken } from './tokens.js';

/** Participante dona do token do link pessoal. 404 se o token não existe ou o link já expirou (evento + 7 dias). */
export async function findMenteeByToken(ctx: AppContext, token: string | undefined): Promise<MenteeDoc> {
  if (!token || token.length > 200) throw new AppError('NOT_FOUND', 'Não encontramos sua inscrição.');
  const doc = await ctx.c.mentees.findOne({ tokenHash: hashMenteeToken(token), eventId: ctx.config.eventId });
  if (!doc) throw new AppError('NOT_FOUND', 'Não encontramos sua inscrição.');
  const ev = await ctx.c.events.findOne({ _id: ctx.config.eventId }, { projection: { date: 1 } });
  if (ev) {
    const until = Date.parse(`${ev.date}T00:00:00Z`) + (1 + ctx.config.linkValidDaysAfterEvent) * 86400_000;
    if (ctx.now().getTime() > until) throw new AppError('NOT_FOUND', 'Este link expirou.');
  }
  return doc;
}
