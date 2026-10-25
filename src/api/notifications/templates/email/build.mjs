// Gera os 9 pares .html (CSS inline via juice) + .txt a partir de emails.mjs e layout.mjs.
//   node src/api/notifications/templates/email/build.mjs            -> grava os arquivos aqui
//   node .../build.mjs --preview <dir>                              -> também renderiza com fixtures/sample-data.json em <dir>
// Falha se um {{...}} usado não pertencer às variáveis do e-mail (própria + comuns).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import juice from 'juice';
import { COMMON_VARS, EMAILS } from './emails.mjs';
import { renderHtml, renderText } from './layout.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const placeholders = (s) => [...s.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]);
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx > 0 ? process.argv[previewIdx + 1] : null;
const sample = JSON.parse(readFileSync(join(dir, 'fixtures/sample-data.json'), 'utf8'));
let failed = false;

for (const e of EMAILS) {
  const html = juice(renderHtml(e), { removeStyleTags: true, preserveMediaQueries: true, preserveImportant: true, applyWidthAttributes: false });
  const txt = renderText(e);
  const allowed = new Set([...e.vars, ...COMMON_VARS]);
  for (const [kind, body] of [['html', html], ['txt', txt]]) {
    for (const v of new Set(placeholders(body))) {
      if (!allowed.has(v)) { console.error(`${e.id}.${kind}: variável fora do PLAN: {{${v}}}`); failed = true; }
    }
  }
  writeFileSync(join(dir, `${e.id}.html`), html);
  writeFileSync(join(dir, `${e.id}.txt`), txt);
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    const data = { ...sample.common, ...sample.templates[e.id] };
    const fill = (s, esc) => s.replace(/\{\{([a-z_]+)\}\}/g, (_, k) => { if (!(k in data)) throw new Error(`${e.id}: sem dado para ${k}`); return esc ? escapeHtml(data[k]) : data[k]; });
    writeFileSync(join(previewDir, `${e.id}.html`), fill(html, true));
    writeFileSync(join(previewDir, `${e.id}.txt`), fill(txt, false));
  }
}
if (failed) process.exit(1);
console.log(`ok: ${EMAILS.length} e-mails gerados`);
