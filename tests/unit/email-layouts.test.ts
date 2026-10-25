import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMAIL_COMMON_VARS, EMAIL_SUBJECTS, EMAIL_TEMPLATE_IDS, EMAIL_TEMPLATE_VARS, type EmailTemplateId } from "../../src/api/notifications/templates/email/subjects.js";

/**
 * PLAN, "Testes dos e-mails", caixas 1 e 2: os 8 layouts renderizam com dados de exemplo sem `{{` sobrando
 * (snapshot do HTML e do texto) e todos os links são absolutos e nenhum executa ação.
 */
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/api/notifications/templates/email");
const sample = JSON.parse(readFileSync(resolve(DIR, "fixtures/sample-data.json"), "utf8")) as { common: Record<string, string>; templates: Record<string, Record<string, string>> };
const read = (id: string, ext: "html" | "txt") => readFileSync(resolve(DIR, `${id}.${ext}`), "utf8");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Mesma regra do PLAN: `{{variavel}}`, escape de HTML no .html; variável faltando é erro. */
function fill(tpl: string, vars: Record<string, string>, html: boolean): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`variável ausente: ${k}`);
    return html ? esc(vars[k]!) : vars[k]!;
  });
}
const varsFor = (id: EmailTemplateId) => ({ ...sample.common, ...sample.templates[id]! });
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!);

describe("layouts de e-mail (8): arquivos e variáveis", () => {
  it("existem os 8 pares .html + .txt com os nomes do PLAN", () => {
    expect(EMAIL_TEMPLATE_IDS).toEqual(["01-inscricao-recebida", "02-convite-horario", "03-confirmacao", "04-convite-expirado", "05-cancelamento-mentora", "06-acesso-mentora", "07-inscricao-cancelada", "08-horario-liberado"]);
    for (const id of EMAIL_TEMPLATE_IDS) {
      expect(read(id, "html").length, id).toBeGreaterThan(500);
      expect(read(id, "txt").length, id).toBeGreaterThan(50);
    }
  });

  it.each(EMAIL_TEMPLATE_IDS)("%s: usa só as variáveis do PLAN (próprias + comuns) e todas as próprias aparecem", (id) => {
    const allowed = new Set<string>([...EMAIL_COMMON_VARS, ...EMAIL_TEMPLATE_VARS[id]]);
    for (const ext of ["html", "txt"] as const) {
      const used = new Set(placeholders(read(id, ext)));
      for (const v of used) expect(allowed.has(v), `${id}.${ext} usa {{${v}}} fora do PLAN`).toBe(true);
    }
    const inHtml = new Set(placeholders(read(id, "html")));
    for (const v of EMAIL_TEMPLATE_VARS[id]) expect(inHtml.has(v) || placeholders(EMAIL_SUBJECTS[id]).includes(v), `${id}: {{${v}}} nunca é usada`).toBe(true);
  });

  it("variável faltando é erro de renderização (nunca sai {{...}} cru)", () => {
    const { nome: _omit, ...semNome } = varsFor("01-inscricao-recebida");
    expect(() => fill(read("01-inscricao-recebida", "html"), semNome, true)).toThrow(/nome/);
  });

  it("valores são escapados no HTML", () => {
    const out = fill(read("01-inscricao-recebida", "html"), { ...varsFor("01-inscricao-recebida"), nome: `<script>alert("x")</script>` }, true);
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe.each(EMAIL_TEMPLATE_IDS)("layout %s com dados de exemplo", (id) => {
  const html = fill(read(id, "html"), varsFor(id), true);
  const txt = fill(read(id, "txt"), varsFor(id), false);
  const subject = fill(EMAIL_SUBJECTS[id], varsFor(id), false);

  it("não sobra `{{` nem `}}` no HTML, no texto nem no assunto", () => {
    for (const out of [html, txt, subject]) expect(out).not.toMatch(/\{\{|\}\}/);
  });

  it("snapshot do HTML, do texto e do assunto", async () => {
    await expect(html).toMatchFileSnapshot(`__snapshots__/email/${id}.html`);
    await expect(txt).toMatchFileSnapshot(`__snapshots__/email/${id}.txt`);
    expect(subject).toMatchSnapshot();
  });

  it("estrutura de cliente de e-mail: tabela, largura máxima 600 px, sem JavaScript, preheader, imagens com alt e URL absoluta", () => {
    expect(html).toMatch(/<table[^>]*role="presentation"/);
    expect(html).toMatch(/max-width:\s*600px/);
    expect(html).not.toMatch(/<script|javascript:|\son[a-z]+=/i);
    expect(html).toMatch(/class="preheader"/);
    for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
      expect(img[0], "img sem alt").toMatch(/\salt="/);
      expect(img[0], "img com URL relativa").toMatch(/\ssrc="https:\/\//);
    }
    for (const m of html.matchAll(/\ssrc="([^"]*)"/g)) expect(m[1], "src relativo").toMatch(/^https:\/\//);
  });

  it("todos os links do HTML e do texto são absolutos (https) e nenhum executa ação", () => {
    const hrefs = [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    expect(hrefs.length).toBeGreaterThan(0);
    const textUrls = txt.match(/\bhttps?:\/\/\S+/g) ?? [];
    for (const u of [...hrefs, ...textUrls]) {
      expect(u, "link relativo ou sem https").toMatch(/^https:\/\/[^/\s]+/);
      const url = new URL(u);
      // PLAN: botões levam a P6 (/mentoria/minha?t=<token>) ou ao .ics (E06, só leitura), nunca a uma ação por GET
      expect(url.pathname, u).not.toMatch(/accept|aceit|confirm|decline|recus|cancel|logout|delete|apagar/i);
      expect(url.search, u).not.toMatch(/action=|accept|aceit|confirm|decline|recus|cancel/i);
    }
    expect(txt).toMatch(/https:\/\//);
  });
});

describe("layout 3 (confirmação): botão de agenda e links de ação", () => {
  it("link_agenda aponta para o .ics (E06) e link_minha_mentoria para P6 com o token", () => {
    const vars = varsFor("03-confirmacao");
    expect(vars.link_agenda).toMatch(/^https:\/\/.+\.ics\?t=/);
    expect(vars.link_minha_mentoria).toMatch(/^https:\/\/.+\/mentoria\/minha\?t=/);
    expect(fill(read("03-confirmacao", "html"), vars, true)).toContain(vars.link_agenda);
  });
});

describe("layout 7 (inscrição cancelada pela participante)", () => {
  it("botão 'Fazer nova inscrição' leva a P4 sem token (link_inscricao) e o texto segue a UI-SPEC", () => {
    const vars = varsFor("07-inscricao-cancelada");
    expect(vars.link_inscricao).toBe("https://techwoman.dev/mentoria/inscricao");
    const html = fill(read("07-inscricao-cancelada", "html"), vars, true);
    expect(html).toContain(`href="${vars.link_inscricao}"`);
    expect(html).toContain("Fazer nova inscrição");
    expect(html).toContain("Sua inscrição foi cancelada");
    const txt = fill(read("07-inscricao-cancelada", "txt"), vars, false);
    expect(txt).toContain("Tudo certo, Joana. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu.");
    expect(txt).toContain("Se havia um horário marcado, ele foi liberado.");
    expect(txt).not.toMatch(/\?t=/);
    expect(EMAIL_SUBJECTS["07-inscricao-cancelada"]).toBe("Sua inscrição na mentoria do Tech Woman foi cancelada");
  });
});

describe("layout 8 (horário liberado pela participante)", () => {
  it("botão 'Escolher outro horário' leva a P6 (link_minha_mentoria) e o texto segue o PLAN", () => {
    const vars = varsFor("08-horario-liberado");
    const html = fill(read("08-horario-liberado", "html"), vars, true);
    expect(html).toContain(`href="${vars.link_minha_mentoria}"`);
    expect(html).toContain("Escolher outro horário");
    expect(html).toContain("Seu horário foi liberado");
    expect(html).toContain("HORÁRIO LIBERADO");
    const txt = fill(read("08-horario-liberado", "txt"), vars, false);
    expect(txt).toContain("Tudo bem, Joana. O horário das 14h15 foi liberado, como você pediu.");
    expect(txt).toContain("Você continua na fila com prioridade: as mentoras veem sua inscrição primeiro.");
    expect(EMAIL_SUBJECTS["08-horario-liberado"]).toBe("Seu horário das {{horario}} foi liberado");
  });
});
