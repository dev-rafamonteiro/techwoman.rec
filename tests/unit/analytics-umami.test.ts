import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  BEFORE_SEND_GLOBAL,
  PUBLIC_ROUTES,
  UMAMI_SCRIPT_SRI,
  UMAMI_VERSION,
  beforeSend,
  cleanEventData,
  createAnalytics,
  isPublicPath,
  parseConfig,
  type AnalyticsConfig,
  type UmamiLike,
} from "../../src/web/analytics/core.js";

/** PLAN, Analytics (Umami): só páginas públicas, sem query string, eventos só com as propriedades da lista. */
const root = new URL("../../", import.meta.url);
const ORIGIN = "https://techwoman.dev";
const CFG: AnalyticsConfig = { websiteId: "d11a68b3-ce00-4875-b377-7ffa6c31f404", hostUrl: "https://analytics.techwoman.dev" };
const FORBIDDEN = /email|phone|telefone|linkedin|token|SECRET|menteeId|a@b\.com|Fulana|"id"/i;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("tracker vendorizado", () => {
  it("SRI da constante bate com src/web/public/a/u.js", () => {
    const file = readFileSync(new URL("src/web/public/a/u.js", root));
    expect(`sha384-${createHash("sha384").update(file).digest("base64")}`).toBe(UMAMI_SCRIPT_SRI);
  });

  it("versão do script é a mesma da imagem em ops/analytics/compose.yaml", () => {
    const compose = readFileSync(new URL("ops/analytics/compose.yaml", root), "utf8");
    expect(compose).toContain(`image: ghcr.io/umami-software/umami:${UMAMI_VERSION}\n`);
  });
});

describe("páginas públicas e config", () => {
  it("só a lista fechada de caminhos públicos", () => {
    for (const p of Object.keys(PUBLIC_ROUTES)) expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath("/mentoria/minha?t=abc")).toBe(true);
    expect(isPublicPath("/jornada/")).toBe(true);
    for (const p of ["/admin", "/admin/mentoras", "/mentora", "/mentora/agenda", "/entrar", "/entrar/nova-senha", "/_ui", "/l/abc", "/cadastro", "/x", ""]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("config inválida ou vazia desliga", () => {
    expect(parseConfig(CFG.websiteId, CFG.hostUrl)).toEqual(CFG);
    expect(parseConfig("", CFG.hostUrl)).toBeNull();
    expect(parseConfig(null, null)).toBeNull();
    expect(parseConfig("nao-e-uuid", CFG.hostUrl)).toBeNull();
    expect(parseConfig(CFG.websiteId, "http://analytics.techwoman.dev")).toBeNull();
    expect(parseConfig(CFG.websiteId, "https://analytics.techwoman.dev/")).toBeNull();
    expect(parseConfig(CFG.websiteId, "https://a.dev\"><script>")).toBeNull();
  });
});

describe("before-send", () => {
  const base = { website: CFG.websiteId, hostname: "techwoman.dev", screen: "390x844", language: "pt-BR", title: "Admin · Fulana", tag: "x", id: "u1" };
  const ctx = (path: string, keepReferrer = true) => ({ path, origin: ORIGIN, keepReferrer });

  it("tira query e hash da url e troca o título pelo rótulo da rota", () => {
    const out = beforeSend("event", { ...base, url: "/mentoria/minha?t=SECRET#x", referrer: "" }, ctx("/mentoria/minha?t=SECRET"));
    expect(out).toMatchObject({ url: "/mentoria/minha", title: "P6 · Minha mentoria" });
    expect(JSON.stringify(out)).not.toMatch(/SECRET|Fulana/);
    expect(out).not.toHaveProperty("tag");
    expect(out).not.toHaveProperty("id");
  });

  it("descarta caminho não público, mesmo que a url do payload pareça pública", () => {
    expect(beforeSend("event", { ...base, url: "/" }, ctx("/admin"))).toBeNull();
    expect(beforeSend("event", { ...base, url: "/" }, ctx("/entrar"))).toBeNull();
    expect(beforeSend("event", { ...base, url: "/" }, ctx("/mentora/agenda"))).toBeNull();
  });

  it("descarta identify, performance e payload inválido", () => {
    expect(beforeSend("identify", { ...base, url: "/" }, ctx("/"))).toBeNull();
    expect(beforeSend("performance", { ...base, url: "/" }, ctx("/"))).toBeNull();
    expect(beforeSend("event", null, ctx("/"))).toBeNull();
  });

  it("referrer: só externo, sem query, e só no primeiro pageview", () => {
    const ext = beforeSend("event", { ...base, url: "/", referrer: "https://instagram.com/p/1?utm=a&t=x#h" }, ctx("/"));
    expect(ext?.referrer).toBe("https://instagram.com/p/1");
    expect(beforeSend("event", { ...base, url: "/", referrer: "/mentoria/minha?t=SECRET" }, ctx("/"))?.referrer).toBe("");
    expect(beforeSend("event", { ...base, url: "/", referrer: `${ORIGIN}/admin` }, ctx("/"))?.referrer).toBe("");
    expect(beforeSend("event", { ...base, url: "/", referrer: "https://instagram.com/" }, ctx("/", false))?.referrer).toBe("");
    expect(beforeSend("event", { ...base, url: "/", referrer: "https://instagram.com/", name: "convite_aceito" }, ctx("/"))?.referrer).toBe("");
  });

  it("evento: nome fora da lista é descartado; data só com as propriedades permitidas", () => {
    expect(beforeSend("event", { ...base, url: "/", name: "qualquer" }, ctx("/"))).toBeNull();
    const out = beforeSend("event", {
      ...base, url: "/", name: "inscricao_concluida",
      data: { area: "dados", periodo: "morning", email: "a@b.com", name: "Fulana", phone: "81999999999", token: "SECRET" },
    }, ctx("/mentoria/inscricao"));
    expect(out?.data).toEqual({ area: "dados", periodo: "morning" });
  });

  it("valores fora do formato são descartados", () => {
    expect(cleanEventData("inscricao_concluida", { area: "Fulana da Silva", periodo: "noite" })).toBeUndefined();
    expect(cleanEventData("inscricao_erro", { codigo: "a@b.com" })).toBeUndefined();
    expect(cleanEventData("inscricao_erro", { codigo: "ALREADY_REGISTERED" })).toEqual({ codigo: "ALREADY_REGISTERED" });
    expect(cleanEventData("convite_recusado", { motivo: "outro" })).toBeUndefined();
    expect(cleanEventData("convite_aceito", { email: "a@b.com" })).toBeUndefined();
  });
});

describe("helper track/pageview", () => {
  function setup(opts: { config?: AnalyticsConfig | null; path?: string } = {}) {
    const calls: unknown[][] = [];
    let path = opts.path ?? "/";
    const sent: (Record<string, unknown> | null)[] = [];
    const a = createAnalytics({
      config: () => (opts.config === undefined ? CFG : opts.config),
      path: () => path,
      origin: () => ORIGIN,
      load: vi.fn(async (): Promise<UmamiLike> => ({
        // imita o script: chama o before-send de forma síncrona dentro do track
        track: (name?: string, data?: Record<string, string>) => {
          calls.push([name, data]);
          sent.push(a.hook("event", { website: CFG.websiteId, url: "/qualquer?t=SECRET", referrer: "https://google.com/?q=x", ...(name ? { name, data } : {}) }));
        },
      })),
    });
    return { a, calls, sent, setPath: (p: string) => { path = p; } };
  }

  it("no-op com analytics desligado: nem carrega o script", async () => {
    const deps = setup({ config: null });
    deps.a.pageview("/");
    deps.a.track("convite_aceito");
    await flush();
    expect(deps.calls).toEqual([]);
  });

  it("fora de página pública: não carrega o script nem envia", async () => {
    const deps = setup({ path: "/admin" });
    deps.a.pageview("/admin");
    deps.a.pageview("/entrar");
    deps.a.track("convite_aceito");
    await flush();
    expect(deps.calls).toEqual([]);
  });

  it("em página pública: envia com o caminho da chamada e data limpa", async () => {
    const deps = setup({ path: "/mentoria/inscricao" });
    deps.a.pageview("/mentoria/inscricao");
    // @ts-expect-error email não é propriedade de inscricao_concluida
    deps.a.track("inscricao_concluida", { area: "dados", periodo: "any", email: "a@b.com" });
    deps.setPath("/admin"); // navegou antes do envio: vale o caminho da chamada
    await flush();
    expect(deps.calls).toEqual([[undefined, undefined], ["inscricao_concluida", { area: "dados", periodo: "any" }]]);
    expect(deps.sent[0]).toMatchObject({ url: "/mentoria/inscricao", referrer: "https://google.com/" });
    expect(deps.sent[1]).toMatchObject({ url: "/mentoria/inscricao", referrer: "", name: "inscricao_concluida", data: { area: "dados", periodo: "any" } });
    for (const s of deps.sent) expect(JSON.stringify(s)).not.toMatch(FORBIDDEN);
  });

  it("hook fora de um envio iniciado pelo helper descarta", () => {
    const deps = setup();
    expect(deps.a.hook("event", { website: CFG.websiteId, url: "/" })).toBeNull();
  });
});

describe("script real do Umami (u.js) num navegador falso", () => {
  function browser(href: string, referrer: string) {
    const bodies: { url: string; body: Record<string, any>; headers: Record<string, string> }[] = [];
    const attrs: Record<string, string> = {
      "data-website-id": CFG.websiteId,
      "data-host-url": CFG.hostUrl,
      "data-auto-track": "false",
      "data-exclude-search": "true",
      "data-exclude-hash": "true",
      "data-do-not-track": "true",
      "data-before-send": BEFORE_SEND_GLOBAL,
    };
    const u = new URL(href);
    const win: Record<string, any> = {
      screen: { width: 390, height: 844 },
      navigator: { language: "pt-BR" },
      location: { hostname: u.hostname, href: u.href, origin: u.origin, pathname: u.pathname },
      document: {
        currentScript: { getAttribute: (n: string) => attrs[n] ?? null, src: `${ORIGIN}/a/u.js?v=${UMAMI_VERSION}` },
        referrer, title: "Admin · Fulana da Silva", readyState: "complete", addEventListener: () => undefined,
      },
      history: { pushState: () => undefined, replaceState: () => undefined },
      localStorage: { getItem: () => null },
      fetch: async (url: string, init: { body: string; headers: Record<string, string> }) => {
        bodies.push({ url, body: JSON.parse(init.body), headers: init.headers });
        return { json: async () => ({ cache: "c" }) };
      },
      setTimeout, URL, Promise, JSON,
    };
    win.window = win;
    win.top = win;
    vm.runInNewContext(readFileSync(new URL("src/web/public/a/u.js", root), "utf8"), win);
    return { win, bodies };
  }

  it("P6 com token: pageview sem query, sem título da aba e envio para o host configurado", async () => {
    const { win, bodies } = browser(`${ORIGIN}/mentoria/minha?t=SECRET#frag`, `${ORIGIN}/l/abc?x=SECRET`);
    let path = "/mentoria/minha";
    const a = createAnalytics({ config: () => CFG, path: () => path, origin: () => ORIGIN, load: async () => win.umami });
    win[BEFORE_SEND_GLOBAL] = a.hook;
    a.pageview(path);
    a.track("agenda_adicionada");
    await flush(); await flush();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.url).toBe("https://analytics.techwoman.dev/api/send");
    expect(bodies[0]!.body).toMatchObject({ type: "event", payload: { url: "/mentoria/minha", title: "P6 · Minha mentoria", referrer: "" } });
    expect(bodies[1]!.body.payload).toMatchObject({ name: "agenda_adicionada", url: "/mentoria/minha" });
    for (const b of bodies) expect(JSON.stringify(b)).not.toMatch(/SECRET|frag|Fulana/);

    path = "/admin";
    a.pageview(path);
    a.track("convite_aceito");
    win.umami.track(); // chamada direta ao script (fora do helper) também é barrada pelo before-send
    await flush(); await flush();
    expect(bodies).toHaveLength(2);
  });

  it("identify nunca sai", async () => {
    const { win, bodies } = browser(`${ORIGIN}/`, "");
    const a = createAnalytics({ config: () => CFG, path: () => "/", origin: () => ORIGIN, load: async () => win.umami });
    win[BEFORE_SEND_GLOBAL] = a.hook;
    win.umami.identify("fulana@x.com");
    await flush();
    expect(bodies).toHaveLength(0);
  });
});
