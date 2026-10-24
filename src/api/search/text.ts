import type { Collection, Document } from 'mongodb';
import type { AppContext } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { normalizePhoneBR } from '../lib/normalize.js';

/** Resultado de busca: no máximo 50 itens, sem cursor (PLAN, seção de busca no Atlas). */
export const SEARCH_RESULT_LIMIT = 50;

/** Índices do Atlas Search (criados por `createSearchIndexes` em @tw/db). */
export const SEARCH_INDEX = { mentees: 'mentees_text', staff: 'staff_text' } as const;

const equals = (path: string, value: string | boolean) => ({ equals: { path, value } });

/**
 * Busca por palavra tolerante a erro de digitação. A tolerância (fuzzy) é da consulta, não do índice: o mesmo texto vai
 * exato (com peso maior, para o acerto vir primeiro) e com fuzzy. Até 2 erros quando há palavra com 7+ letras
 * ("phelipe" -> Felipe), senão 1; o autocomplete do nome também aceita 1 erro ("fil" -> Felipe).
 */
function typoTolerant(q: string, textPaths: string[], namePath: string): Document[] {
  const maxEdits = Math.max(...q.split(/\s+/).map((w) => w.length)) >= 7 ? 2 : 1;
  return [
    { text: { query: q, path: textPaths, score: { boost: { value: 3 } } } },
    { text: { query: q, path: textPaths, fuzzy: { maxEdits, maxExpansions: 50 } } },
    { autocomplete: { query: q, path: namePath, score: { boost: { value: 2 } } } },
    { autocomplete: { query: q, path: namePath, fuzzy: { maxEdits: 1, maxExpansions: 50 } } },
  ];
}

/**
 * Executa o pipeline. Qualquer falha do `$search` (índice ausente, Atlas fora) vira 503 com mensagem;
 * a busca nunca devolve 500 nem registra o texto digitado.
 */
export async function runSearch<T extends Document>(ctx: AppContext, coll: Collection<any>, pipeline: Document[], what: string): Promise<T[]> {
  try {
    if (ctx.searchOverrides?.search) return (await ctx.searchOverrides.search(pipeline)) as T[];
    // $search só aceita readConcern "local" (o cliente usa "majority" por padrão; o Atlas recusa)
    return await coll.aggregate<T>(pipeline, { readConcern: { level: 'local' } }).toArray();
  } catch (err) {
    ctx.log.error({ what, err: (err as Error).message?.slice(0, 200) }, 'busca indisponível');
    throw new AppError('INTERNAL', 'A busca está indisponível no momento. Tente de novo em instantes.', { status: 503, headers: { 'Retry-After': '5' } });
  }
}

export interface MenteeSearch {
  q: string;
  eventId: string;
  /** Sempre `waiting` na fila da mentora; opcional no admin. */
  status?: string;
  areas?: string[];
  priority?: boolean;
  period?: string;
  /** E35: inclui e-mail e telefone na busca e na resposta. */
  admin?: boolean;
}

const STAFF_FIELDS = { name: 1, area: 1, preferredPeriod: 1, linkedin: 1, note: 1, priority: 1, priorityReason: 1, status: 1, queuedAt: 1 };
const ADMIN_FIELDS = { ...STAFF_FIELDS, email: 1, phone: 1, consent: 1, quizScores: 1, createdAt: 1, currentAppointmentId: 1 };

/**
 * Participantes por palavra: nome e comentário com tolerância a erro de digitação e acentos, nome por prefixo e,
 * no admin, e-mail e telefone exatos. O `$match` depois da busca lê o documento atual (o índice atrasa alguns segundos).
 * Projeção positiva: campo novo no documento nunca vaza para a resposta.
 */
export function menteeSearchPipeline(s: MenteeSearch): Document[] {
  const should: Document[] = typoTolerant(s.q, ['name', 'note'], 'name');
  if (s.admin) {
    const exact = [...new Set([s.q, s.q.toLowerCase()])];
    should.push({ text: { query: exact, path: 'email' } });
    const phone = normalizePhoneBR(s.q);
    if (phone) should.push({ text: { query: phone, path: 'phone' } });
  }
  const filter: Document[] = [equals('eventId', s.eventId)];
  if (s.status) filter.push(equals('status', s.status));
  if (s.areas?.length) filter.push({ in: { path: 'area', value: s.areas } });
  if (s.priority) filter.push(equals('priority', true));

  const current: Document = { eventId: s.eventId };
  if (s.status) current['status'] = s.status;
  if (s.areas?.length) current['area'] = { $in: s.areas };
  if (s.priority) current['priority'] = true;
  if (s.period) current['preferredPeriod'] = s.period;

  return [
    { $search: { index: SEARCH_INDEX.mentees, compound: { should, filter, minimumShouldMatch: 1 } } },
    { $limit: s.period ? 200 : 100 },
    { $match: current },
    { $limit: SEARCH_RESULT_LIMIT },
    { $project: s.admin ? ADMIN_FIELDS : STAFF_FIELDS },
  ];
}

export interface StaffSearch {
  q: string;
  status?: 'active' | 'disabled';
  area?: string;
  neverLoggedIn?: boolean;
}

/** Mentoras por palavra: nome, bio, e-mail exato e nome por prefixo; filtros reaplicados sobre o documento atual. */
export function mentorSearchPipeline(s: StaffSearch): Document[] {
  const should: Document[] = [
    ...typoTolerant(s.q, ['name', 'bio'], 'name'),
    { text: { query: [...new Set([s.q, s.q.toLowerCase()])], path: 'email' } },
  ];
  const filter: Document[] = [equals('roles', 'mentor')];
  if (s.status) filter.push(equals('status', s.status));
  if (s.area) filter.push(equals('areas', s.area));

  const current: Document = { roles: 'mentor' };
  if (s.status) current['status'] = s.status;
  if (s.area) current['areas'] = s.area;
  if (s.neverLoggedIn) current['lastLoginAt'] = null;

  return [
    { $search: { index: SEARCH_INDEX.staff, compound: { should, filter, minimumShouldMatch: 1 } } },
    { $limit: 100 },
    { $match: current },
    { $limit: SEARCH_RESULT_LIMIT },
    { $project: { passwordHash: 0 } },
  ];
}
