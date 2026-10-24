import type { FastifyInstance } from "fastify";
import { createTestDb, type TestDb } from "./db.js";
import { seedWorld, userDoc, type World } from "./seed.js";
import { Client, loadApi, testPasswordHash, type ApiModules } from "./app.js";
import { getCollections } from "../../src/db/collections.js";

/** 2026-11-14 08:00 em Recife: antes do primeiro horário (09:00) com folga para RN04/RN05. */
export const NOW = new Date("2026-11-14T11:00:00Z");

export interface Booted {
  api: ApiModules;
  t: TestDb;
  app: FastifyInstance;
  w: World;
  clock: { now: Date };
  mentor: Client[];
  admin: Client;
  superAdmin: Client;
  anon: Client;
  /** Convida via E24 como a mentora `i`. */
  invite(i: number, menteeIdx: number, slotIdx: number, tableIdx: number, headers?: Record<string, string>): ReturnType<Client["post"]>;
  close(): Promise<void>;
}

export async function bootApi(
  api: ApiModules,
  label: string,
  opts: { mentors?: number; mentees?: number; tables?: number; registrationOpen?: boolean; streams?: boolean } = {},
): Promise<Booted> {
  const { mentors = 2, mentees = 5, tables = 20, registrationOpen = true } = opts;
  const t = await createTestDb(label);
  const w = await seedWorld(t.db, { mentors, tables, mentees, registrationOpen });
  const c = getCollections(t.db);
  const hash = await testPasswordHash();
  await c.users.deleteMany({});
  w.mentors = Array.from({ length: mentors }, (_, i) => userDoc(i + 1, { passwordHash: hash }));
  const staff = [
    userDoc(900, { name: "Admin", email: "admin@techwoman.test", roles: ["admin"], passwordHash: hash, availability: [] }),
    userDoc(901, { name: "Super", email: "super@techwoman.test", roles: ["super_admin"], passwordHash: hash, availability: [] }),
  ];
  if (w.mentors.length) await c.users.insertMany(w.mentors);
  await c.users.insertMany(staff);
  const clock = { now: NOW };
  const app = await api.buildApp({ db: t.db, client: t.client, now: () => clock.now, streams: opts.streams ?? false });
  const login = async (email: string) => {
    const cl = new Client(app);
    const r = await cl.login(email);
    if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.body)}`);
    return cl;
  };
  const mentor = await Promise.all(w.mentors.map((m) => login(m.email)));
  const admin = await login("admin@techwoman.test");
  const superAdmin = await login("super@techwoman.test");
  return {
    api, t, app, w, clock, mentor, admin, superAdmin, anon: new Client(app),
    invite: (i, mi, si, ti, headers) =>
      mentor[i]!.post("/api/mentor/appointments", { menteeId: String(w.mentees[mi]!.doc._id), slotId: w.slotIds[si]!, tableId: String(w.tables[ti]!._id) }, headers),
    close: async () => {
      await app.close();
      await t.drop();
    },
  };
}

export { loadApi };
