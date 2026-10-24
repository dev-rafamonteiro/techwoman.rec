import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { getTestMongoUri } from "./env.js";

export interface TestDb {
  client: MongoClient;
  db: Db;
  uri: string;
  dbName: string;
  /** Apaga todos os documentos mantendo índices. */
  clean(): Promise<void>;
  /** Derruba o banco e fecha a conexão. */
  drop(): Promise<void>;
}

/** Banco isolado por arquivo de teste: tw_test_<slug>_<rand>. */
export async function createTestDb(label: string): Promise<TestDb> {
  const uri = getTestMongoUri();
  const slug = label.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase();
  const dbName = `tw_test_${slug}_${randomBytes(4).toString("hex")}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  return {
    client,
    db,
    uri,
    dbName,
    async clean() {
      for (const c of await db.collections()) await c.deleteMany({});
    },
    async drop() {
      await db.dropDatabase();
      await client.close();
    },
  };
}
