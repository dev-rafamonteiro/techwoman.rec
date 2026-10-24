import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from './collections.js';

/** Índice do Atlas Search de uma coleção (PLAN, seção de busca no Atlas). */
export interface SearchIndexSpec {
  collection: string;
  name: string;
  type: 'search';
  definition: Document;
}

const portuguese = { type: 'string', analyzer: 'lucene.portuguese' } as const;
const keyword = { type: 'string', analyzer: 'lucene.keyword' } as const;
const nameField = [portuguese, { type: 'autocomplete', foldDiacritics: true }];

/** Busca por palavra (acentos e erros de digitação). */
export const TEXT_SEARCH_INDEXES: readonly SearchIndexSpec[] = [
  {
    collection: COLLECTIONS.mentees,
    name: 'mentees_text',
    type: 'search',
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          eventId: { type: 'token' },
          status: { type: 'token' },
          area: { type: 'token' },
          priority: { type: 'boolean' },
          name: nameField,
          note: portuguese,
          email: keyword,
          phone: keyword,
        },
      },
    },
  },
  {
    collection: COLLECTIONS.users,
    name: 'staff_text',
    type: 'search',
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          name: nameField,
          email: keyword,
          areas: { type: 'token' },
          bio: portuguese,
          status: { type: 'token' },
          roles: { type: 'token' },
        },
      },
    },
  },
];

export interface SearchIndexOptions {
  /** Índices a criar; padrão: os de busca por palavra. */
  specs?: readonly SearchIndexSpec[];
  /** Espera cada índice ficar `queryable` por até N ms (0 = não espera). */
  waitMs?: number;
}

export interface SearchIndexResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  /** true quando o servidor não tem Atlas Search (MongoDB comum): nada foi criado. */
  unsupported: boolean;
}

/** `sub` está contido em `full` (o Atlas acrescenta valores padrão à definição devolvida). */
function isSubset(sub: unknown, full: unknown): boolean {
  if (Array.isArray(sub)) return Array.isArray(full) && sub.length === full.length && sub.every((v, i) => isSubset(v, full[i]));
  if (sub && typeof sub === 'object') {
    if (!full || typeof full !== 'object' || Array.isArray(full)) return false;
    return Object.entries(sub).every(([k, v]) => isSubset(v, (full as Record<string, unknown>)[k]));
  }
  return sub === full;
}

/** Servidor sem mongot: `createSearchIndexes` / `$listSearchIndexes` não existem ou não estão configurados. */
function isUnsupported(err: unknown): boolean {
  const e = err as { code?: number; codeName?: string; message?: string };
  return (
    e.code === 31082 || // SearchNotEnabled
    e.codeName === 'CommandNotSupported' ||
    e.codeName === 'SearchNotEnabled' ||
    (/Atlas Search|search index|mongot/i.test(e.message ?? '') && /require|not enabled|not supported|unsupported/i.test(e.message ?? ''))
  );
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { codeName?: string; message?: string };
  return e.codeName === 'IndexAlreadyExists' || /already exists|duplicate/i.test(e.message ?? '');
}

async function waitQueryable(db: Db, spec: SearchIndexSpec, waitMs: number): Promise<void> {
  const end = Date.now() + waitMs;
  while (Date.now() < end) {
    const [ix] = (await db.collection(spec.collection).listSearchIndexes(spec.name).toArray()) as Array<{ queryable?: boolean; status?: string }>;
    if (ix?.queryable) return;
    if (ix?.status === 'FAILED') throw new Error(`índice de busca ${spec.name} falhou ao ser construído`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`índice de busca ${spec.name} não ficou pronto em ${waitMs} ms`);
}

/**
 * Cria os índices de busca de forma idempotente: não existe -> cria; existe com a mesma definição -> nada;
 * definição diferente -> `updateSearchIndex` (só vale para campos editáveis; o Atlas recusa o resto).
 * Em MongoDB sem Atlas Search devolve `unsupported: true` em vez de falhar.
 */
export async function createSearchIndexes(db: Db, opts: SearchIndexOptions = {}): Promise<SearchIndexResult> {
  const result: SearchIndexResult = { created: [], updated: [], unchanged: [], unsupported: false };
  const specs = opts.specs ?? TEXT_SEARCH_INDEXES;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const spec of specs) {
    const coll = db.collection(spec.collection);
    try {
      if (!existing.has(spec.collection)) {
        try {
          await db.createCollection(spec.collection);
        } catch (err) {
          if ((err as { code?: number }).code !== 48) throw err;
        }
        existing.add(spec.collection);
      }
      const [found] = (await coll.listSearchIndexes(spec.name).toArray()) as Array<{ latestDefinition?: Document }>;
      if (!found) {
        try {
          await coll.createSearchIndex({ name: spec.name, type: spec.type, definition: spec.definition });
          result.created.push(spec.name);
        } catch (err) {
          if (!isAlreadyExists(err)) throw err; // outra réplica criou primeiro
          result.unchanged.push(spec.name);
        }
      } else if (isSubset(spec.definition, found.latestDefinition)) {
        result.unchanged.push(spec.name);
      } else {
        await coll.updateSearchIndex(spec.name, spec.definition);
        result.updated.push(spec.name);
      }
      if (opts.waitMs) await waitQueryable(db, spec, opts.waitMs);
    } catch (err) {
      if (isUnsupported(err)) {
        result.unsupported = true;
        return result;
      }
      throw err;
    }
  }
  return result;
}
