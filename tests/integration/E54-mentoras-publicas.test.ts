import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, NOW, type Booted } from "../helpers/boot.js";
import { userDoc } from "../helpers/seed.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * E54 · GET /public/mentors (P7): perfis públicos das mentoras ativas, sem login. Nunca e-mail, telefone,
 * disponibilidade nem dados de login. `availableSlots` = mesma conta do `remainingCapacity` do E30.
 */
const api = await loadApi();

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)]!;
};

describe.skipIf(!api)("E54 · mentoras públicas", () => {
  let b: Booted;
  let c: ReturnType<typeof getCollections>;
  const get = () => b.anon.get("/api/public/mentors");

  beforeAll(async () => {
    // 2 mentoras com os 12 horários, 20 mesas: 12 x min(20, 2) = 24 vagas
    b = await bootApi(api!, "e54", { mentors: 2, mentees: 2, tables: 20 });
    c = getCollections(b.t.db);
    const [m1, m2] = b.w.mentors;
    await c.users.updateOne(
      { _id: m1!._id },
      {
        $set: {
          name: "Zélia Prado",
          phone: "+5581999990001",
          organization: "Banco Exemplo",
          areas: ["dados", "area-sem-rotulo"],
          themes: ["Transição de carreira", "Liderança"],
          bio: "Engenheira de dados.",
          linkedin: "br.linkedin.com/in/zelia-prado",
          photoUrl: "/mentoras/01-zelia.jpg",
        },
      },
    );
    // valores guardados inseguros ou inválidos não saem como link
    await c.users.updateOne({ _id: m2!._id }, { $set: { name: "Ana Lima", photoUrl: "javascript:alert(1)", linkedin: "não é link !!", bio: "  " } });
  }, 120_000);
  afterAll(async () => {
    if (b) await b.close();
  });

  it("público (sem sessão), cache curto, mentoras em ordem de nome e números do programa", async () => {
    const r = await get();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.headers["cache-control"]).toBe("public, max-age=60");
    expect(r.body.items.map((m: any) => m.name)).toEqual(["Ana Lima", "Zélia Prado"]);
    expect(r.body.stats).toEqual({ mentorCount: 2, slotMinutes: 40, availableSlots: 24 });
  });

  it("campos públicos: áreas com rótulo do evento, LinkedIn normalizado em https, foto do site; inválidos viram null", async () => {
    const r = await get();
    const zelia = r.body.items.find((m: any) => m.name === "Zélia Prado");
    expect(zelia).toEqual({
      id: String(b.w.mentors[0]!._id),
      name: "Zélia Prado",
      photoUrl: "/mentoras/01-zelia.jpg",
      organization: "Banco Exemplo",
      areas: [{ key: "dados", label: "Dados" }, { key: "area-sem-rotulo", label: "area-sem-rotulo" }],
      themes: ["Transição de carreira", "Liderança"],
      bio: "Engenheira de dados.",
      linkedin: "https://www.linkedin.com/in/zelia-prado",
    });
    const ana = r.body.items.find((m: any) => m.name === "Ana Lima");
    expect([ana.photoUrl, ana.linkedin, ana.bio, ana.organization, ana.themes]).toEqual([null, null, null, null, []]);
  });

  it("foto `/\\host` vira null; temas saem aparados e sem repetição", async () => {
    const anaId = b.w.mentors[1]!._id;
    await c.users.updateOne({ _id: anaId }, { $set: { photoUrl: "/\\evil.example/x.jpg", themes: [" Liderança ", "Liderança", "Dados"] } });
    try {
      const r = await get();
      const ana = r.body.items.find((m: any) => m.name === "Ana Lima");
      expect([ana.photoUrl, ana.themes]).toEqual([null, ["Liderança", "Dados"]]);
    } finally {
      await c.users.updateOne({ _id: anaId }, { $set: { photoUrl: "javascript:alert(1)", themes: [] } });
    }
  });

  it("nada privado: sem e-mail, telefone, disponibilidade, status nem dados de login", async () => {
    const r = await get();
    const text = JSON.stringify(r.body);
    for (const m of b.w.mentors) expect(text).not.toContain(m.email);
    expect(text).not.toContain("+5581999990001");
    expect(text).not.toContain("techwoman.test");
    for (const key of ["email", "phone", "availability", "passwordHash", "status", "roles", "lastLoginAt", "failedLogins", "themeDomains", "mustChangePassword"]) {
      expect(text, key).not.toMatch(new RegExp(`"${key}"`));
    }
    for (const it of r.body.items) expect(Object.keys(it).sort()).toEqual(["areas", "bio", "id", "linkedin", "name", "organization", "photoUrl", "themes"]);
  });

  it("availableSlots bate com o remainingCapacity do E30 e cai com mentoria marcada", async () => {
    const inv = await b.invite(0, 0, 0, 0);
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const [pub, dash] = await Promise.all([get(), b.admin.get("/api/admin/dashboard")]);
    expect(pub.body.stats.availableSlots).toBe(23);
    expect(pub.body.stats.availableSlots).toBe(dash.body.remainingCapacity);
    // horários livres das mentoras ativas: sem o limite de mesas, menos o horário da mentora com a mentoria
    expect(dash.body.mentorFreeSlots).toBe(23);
  });

  it("horário que já começou não conta", async () => {
    const ev = (await c.events.findOne({}))!;
    b.clock.now = new Date(ev.slots[1]!.startAt.getTime() + 60_000); // s01 e s02 já começaram
    try {
      const r = await get();
      // s01 (com a mentoria marcada) e s02 saem: 10 horários x 2
      expect(r.body.stats.availableSlots).toBe(20);
    } finally {
      b.clock.now = NOW;
    }
  });

  it("mentora desativada e conta só de admin não aparecem; mentora que também é admin aparece", async () => {
    const both = userDoc(50, { name: "Bruna Admin", roles: ["mentor", "admin"], availability: [] });
    await c.users.insertOne(both);
    await c.users.updateOne({ _id: b.w.mentors[1]!._id }, { $set: { status: "disabled" } });
    try {
      const r = await get();
      expect(r.body.items.map((m: any) => m.name)).toEqual(["Bruna Admin", "Zélia Prado"]);
      // Ana desativada sai da contagem e das vagas: 12 horários x 1 mentora - 1 marcada
      expect(r.body.stats).toEqual({ mentorCount: 2, slotMinutes: 40, availableSlots: 11 });
      expect(r.body.items.map((m: any) => m.name)).not.toContain("Admin");
    } finally {
      await c.users.updateOne({ _id: b.w.mentors[1]!._id }, { $set: { status: "active" } });
      await c.users.deleteOne({ _id: both._id });
    }
  });

  it("desempenho: 150 mentoras, 50 leituras seguidas", async () => {
    const extra = Array.from({ length: 150 }, (_, i) =>
      userDoc(1000 + i, { name: `Mentora Carga ${i}`, organization: "Empresa", bio: "Bio ".repeat(40), themes: ["Dados", "Carreira"] }),
    );
    await c.users.insertMany(extra);
    try {
      const times: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        const r = await get();
        times.push(performance.now() - t0);
        expect(r.status).toBe(200);
        expect(r.body.items).toHaveLength(152);
      }
      const s = { n: times.length, p50: +pct(times, 50).toFixed(1), p95: +pct(times, 95).toFixed(1), max: +Math.max(...times).toFixed(1) };
      console.log(`[E54 desempenho] GET /public/mentors com 152 mentoras (ms): ${JSON.stringify(s)}`);
      expect(s.p95).toBeLessThan(300);
    } finally {
      await c.users.deleteMany({ _id: { $in: extra.map((u) => u._id) } });
    }
  });
});
