import { randomBytes } from "node:crypto";
import { MongoClient, type Collection, type Db } from "mongodb";

export interface SearchDb {
  client: MongoClient;
  db: Db;
  /** Prefixo único das coleções criadas por este arquivo. */
  prefix: string;
  mentees: Collection<any>;
  users: Collection<any>;
  /** Apaga índices de busca e coleções do prefixo. */
  cleanup(): Promise<void>;
}

/** Coleções isoladas por prefixo no banco indicado (local: banco de teste do createTestDb; Atlas: techwoman_test). */
export async function openSearchDb(client: MongoClient, db: Db, label: string): Promise<SearchDb> {
  const prefix = `tw_${label}_${randomBytes(3).toString("hex")}_`;
  const names = [`${prefix}mentees`, `${prefix}users`];
  return {
    client,
    db,
    prefix,
    mentees: db.collection(names[0]!),
    users: db.collection(names[1]!),
    async cleanup() {
      for (const n of names) {
        const col = db.collection(n);
        try {
          for (const ix of await col.listSearchIndexes().toArray()) await col.dropSearchIndex(ix.name).catch(() => {});
        } catch {
          /* coleção inexistente */
        }
        await col.drop().catch(() => {});
      }
      await client.close();
    },
  };
}

export const MENTEES_TEXT_INDEX = {
  name: "mentees_text",
  type: "search",
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        eventId: { type: "token" },
        status: { type: "token" },
        area: { type: "token" },
        priority: { type: "boolean" },
        name: [{ type: "string", analyzer: "lucene.portuguese" }, { type: "autocomplete", foldDiacritics: true }],
        note: { type: "string", analyzer: "lucene.portuguese" },
        email: { type: "string", analyzer: "lucene.keyword" },
        phone: { type: "string", analyzer: "lucene.keyword" },
      },
    },
  },
} as const;

/** Cria o índice (se faltar) e espera ficar queryable; falha com erro claro no tempo limite. */
export async function ensureSearchIndex(col: Collection<any>, spec: { name: string; type: string; definition: unknown }, timeoutMs = 240_000): Promise<void> {
  const existing = await col.listSearchIndexes(spec.name).toArray();
  if (existing.length === 0) await col.createSearchIndex(spec as any);
  const end = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < end) {
    const [ix] = (await col.listSearchIndexes(spec.name).toArray()) as any[];
    last = `${ix?.status ?? "ausente"}`;
    if (ix?.queryable) return;
    if (ix?.status === "FAILED") throw new Error(`índice ${spec.name} FAILED: ${JSON.stringify(ix.statusDetail ?? {}).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`índice ${spec.name} não ficou READY em ${timeoutMs} ms (último status: ${last})`);
}

/** Espera até a consulta devolver `n` resultados (índice de busca é eventualmente consistente). */
export async function waitForCount(run: () => Promise<unknown[]>, n: number, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  let got = -1;
  while (Date.now() < end) {
    got = (await run()).length;
    if (got >= n) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`índice não alcançou ${n} documentos em ${timeoutMs} ms (viu ${got})`);
}
