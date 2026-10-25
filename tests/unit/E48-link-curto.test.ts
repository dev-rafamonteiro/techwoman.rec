import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  SHORT_LINK_ALPHABET,
  SHORT_LINK_CODE_LENGTH,
  SHORT_LINK_MAX_ATTEMPTS,
  getOrCreateShortLink,
  newShortLinkCode,
  resolveShortLink,
  shortLink,
  shortLinkExpireAt,
} from "../../src/api/lib/short-links.js";
import { menteeToken } from "../../src/api/lib/tokens.js";
import { logUrl } from "../../src/api/app.js";

/** PLAN, Notificações > Links curtos: código, get-or-create e resolução (coleção falsa em memória). */
type Doc = { _id: string; menteeId: ObjectId; kind: string; tokenVersion: number; createdAt: Date; expireAt: Date };
const FAR = new Date("2027-01-01T00:00:00Z");
const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

function fakeShortLinks(opts: { forcedCodes?: string[] } = {}) {
  const docs = new Map<string, Doc>();
  const same = (d: Doc, q: Partial<Doc>) => d.menteeId.equals(q.menteeId!) && d.kind === q.kind && d.tokenVersion === q.tokenVersion;
  let inserts = 0;
  return {
    docs,
    get inserts() {
      return inserts;
    },
    async findOne(q: Partial<Doc>) {
      if (q._id !== undefined) return docs.get(q._id) ?? null;
      return [...docs.values()].find((d) => same(d, q)) ?? null;
    },
    async insertOne(d: Doc) {
      inserts++;
      const forced = opts.forcedCodes?.shift();
      const doc = forced ? { ...d, _id: forced } : d;
      if (docs.has(doc._id) || [...docs.values()].some((x) => same(x, doc))) throw dup();
      docs.set(doc._id, doc);
      return { acknowledged: true, insertedId: doc._id };
    },
  };
}

describe("E48 link curto: código", () => {
  it("7 caracteres base62 (0-9A-Za-z)", () => {
    expect(SHORT_LINK_CODE_LENGTH).toBe(7);
    expect(SHORT_LINK_ALPHABET).toHaveLength(62);
    expect(new Set(SHORT_LINK_ALPHABET).size).toBe(62);
    for (let i = 0; i < 500; i++) expect(newShortLinkCode()).toMatch(/^[0-9A-Za-z]{7}$/);
  });

  it("sem viés aparente: todos os 62 caracteres aparecem e nenhum domina", () => {
    const n = 62 * 400;
    const counts = new Map<string, number>();
    for (let i = 0; i < n / 7; i++) for (const ch of newShortLinkCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(62);
    for (const v of counts.values()) expect(v).toBeGreaterThan(250);
    for (const v of counts.values()) expect(v).toBeLessThan(560);
  });

  it("shortLink monta <PUBLIC_BASE_URL>/l/<código>", () => {
    expect(shortLink("https://techwoman.dev", "IEO31Kd")).toBe("https://techwoman.dev/l/IEO31Kd");
  });

  it("log mascara o código (/l/*** e /api/l/***) e tira a query", () => {
    expect(logUrl("/l/IEO31Kd")).toBe("/l/***");
    expect(logUrl("/api/l/IEO31Kd?x=1")).toBe("/api/l/***");
    expect(logUrl("/api/public/me?t=abc")).toBe("/api/public/me");
    expect(logUrl("/login")).toBe("/login");
  });
});

describe("E48 link curto: get-or-create", () => {
  const mentee = { _id: new ObjectId(), tokenVersion: 1 };

  it("idempotente: mesma participante + tipo + versão = mesmo código; tipo ou versão nova = outro", async () => {
    const c = { shortLinks: fakeShortLinks() };
    const a = await getOrCreateShortLink(c as never, mentee, "personal", FAR);
    expect(await getOrCreateShortLink(c as never, mentee, "personal", FAR)).toBe(a);
    const cal = await getOrCreateShortLink(c as never, mentee, "calendar", FAR);
    expect(cal).not.toBe(a);
    const v2 = await getOrCreateShortLink(c as never, { ...mentee, tokenVersion: 2 }, "personal", FAR);
    expect(v2).not.toBe(a);
    expect(c.shortLinks.docs.size).toBe(3);
    const doc = c.shortLinks.docs.get(a)!;
    expect(Object.keys(doc).sort()).toEqual(["_id", "createdAt", "expireAt", "kind", "menteeId", "tokenVersion"]);
  });

  it("corrida: duplicate key no índice relê e devolve o código de quem venceu", async () => {
    const sl = fakeShortLinks();
    const winner = { _id: "Winner1", menteeId: mentee._id, kind: "personal", tokenVersion: 1, createdAt: new Date(), expireAt: FAR };
    // o findOne inicial não acha (a outra requisição ainda não gravou); o insert colide no índice
    let first = true;
    const c = {
      shortLinks: {
        findOne: async (q: Partial<Doc>) => (first ? ((first = false), null) : sl.findOne(q)),
        insertOne: async (d: Doc) => {
          sl.docs.set(winner._id, winner as Doc);
          return sl.insertOne(d);
        },
      },
    };
    expect(await getOrCreateShortLink(c as never, mentee, "personal", FAR)).toBe("Winner1");
    expect(sl.docs.size).toBe(1);
  });

  it("código já usado por outra participante (duplicate key no _id): sorteia outro", async () => {
    const sl = fakeShortLinks({ forcedCodes: ["Taken01"] });
    sl.docs.set("Taken01", { _id: "Taken01", menteeId: new ObjectId(), kind: "personal", tokenVersion: 1, createdAt: new Date(), expireAt: FAR });
    const code = await getOrCreateShortLink({ shortLinks: sl } as never, mentee, "personal", FAR);
    expect(code).not.toBe("Taken01");
    expect(sl.inserts).toBe(2);
  });

  it(`desiste depois de ${SHORT_LINK_MAX_ATTEMPTS} colisões no _id`, async () => {
    const sl = fakeShortLinks({ forcedCodes: Array(SHORT_LINK_MAX_ATTEMPTS).fill("Taken01") });
    sl.docs.set("Taken01", { _id: "Taken01", menteeId: new ObjectId(), kind: "personal", tokenVersion: 1, createdAt: new Date(), expireAt: FAR });
    await expect(getOrCreateShortLink({ shortLinks: sl } as never, mentee, "personal", FAR)).rejects.toThrow(/código único/);
    expect(sl.inserts).toBe(SHORT_LINK_MAX_ATTEMPTS);
  });

  it("erro que não é duplicate key sobe", async () => {
    const c = { shortLinks: { findOne: async () => null, insertOne: async () => Promise.reject(new Error("rede")) } };
    await expect(getOrCreateShortLink(c as never, mentee, "personal", FAR)).rejects.toThrow("rede");
  });
});

describe("E48 link curto: resolução", () => {
  const secret = "s".repeat(40);
  const id = new ObjectId();
  const links = new Map<string, Doc>([
    ["Pers001", { _id: "Pers001", menteeId: id, kind: "personal", tokenVersion: 2, createdAt: new Date(), expireAt: FAR }],
    ["Cal0001", { _id: "Cal0001", menteeId: id, kind: "calendar", tokenVersion: 2, createdAt: new Date(), expireAt: FAR }],
    ["Old0001", { _id: "Old0001", menteeId: id, kind: "personal", tokenVersion: 1, createdAt: new Date(), expireAt: FAR }],
    ["Exp0001", { _id: "Exp0001", menteeId: id, kind: "personal", tokenVersion: 2, createdAt: new Date(), expireAt: new Date("2026-11-21T20:59:59Z") }],
    ["Gone001", { _id: "Gone001", menteeId: new ObjectId(), kind: "personal", tokenVersion: 1, createdAt: new Date(), expireAt: FAR }],
  ]);
  const c = {
    shortLinks: { findOne: async (q: { _id: string }) => links.get(q._id) ?? null },
    mentees: { findOne: async (q: { _id: ObjectId }) => (q._id.equals(id) ? { _id: id, tokenVersion: 2 } : null) },
  };
  const go = (code: string) => resolveShortLink(c as never, secret, code, new Date("2026-11-21T21:00:00Z"));
  const token = menteeToken(secret, id, 2);

  it("personal -> /mentoria/minha?t=<token atual>; calendar -> /api/public/calendar.ics?t=<token>", async () => {
    expect(await go("Pers001")).toBe(`/mentoria/minha?t=${token}`);
    expect(await go("Cal0001")).toBe(`/api/public/calendar.ics?t=${token}`);
  });

  it("revogado, vencido, sem participante, inexistente e formato inválido -> /mentoria/minha", async () => {
    for (const code of ["Old0001", "Exp0001", "Gone001", "Nada001", "", "abc", "Pers001x", "Pers-01"]) expect(await go(code), code).toBe("/mentoria/minha");
  });
});

describe("E48 link curto: validade", () => {
  it("expireAt = fim do evento no fuso do evento + 7 dias", () => {
    // 14/11/2026 18:00 em Recife (UTC-3) = 21:00Z; + 7 dias
    expect(shortLinkExpireAt({ date: "2026-11-14", endTime: "18:00", timezone: "America/Recife" }).toISOString()).toBe("2026-11-21T21:00:00.000Z");
  });
});
