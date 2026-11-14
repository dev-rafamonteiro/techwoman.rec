import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { PAGES_SEO, SITE_URL, type PageSeo } from './seo';

const envDir = fileURLToPath(new URL('../..', import.meta.url));

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Troca título, descrição, og:* e canonical do index.html pelos da página (src/web/seo.ts). */
function applySeo(html: string, path: string, seo: PageSeo): string {
  const url = SITE_URL + path;
  const meta = (attr: string, key: string, value: string) => {
    const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
    if (!re.test(html)) throw new Error(`index.html sem <meta ${attr}="${key}">`);
    html = html.replace(re, `$1${esc(value)}$2`);
  };
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`);
  meta('name', 'description', seo.description);
  meta('property', 'og:title', seo.title);
  meta('property', 'og:description', seo.description);
  meta('property', 'og:url', url);
  return html.replace('</title>', `</title>\n    <link rel="canonical" href="${url}" />`);
}

/**
 * Commit do build, mostrado no menu do admin: GIT_SHA (o deploy automático e o Dockerfile passam, porque a imagem não
 * tem o .git) ou, sem ela, o `git rev-parse` local (dev, CI). Sem nenhum dos dois: string vazia (a tela omite).
 */
function gitSha(env: Record<string, string>): string {
  const fromEnv = process.env.GIT_SHA ?? env.GIT_SHA;
  if (fromEnv) return fromEnv.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: envDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Build: um HTML por página pública (dist/mentoras.html, dist/mentoria/inscricao.html...), igual ao index.html mas
 * com título, descrição e canonical próprios, para o Google ler sem executar o JS. O nginx serve com try_files $uri.html.
 */
function seoPages(): Plugin {
  return {
    name: 'tw-seo-pages',
    apply: 'build',
    writeBundle(opts) {
      const out = opts.dir!;
      const base = readFileSync(join(out, 'index.html'), 'utf8');
      for (const [path, seo] of Object.entries(PAGES_SEO)) {
        const file = path === '/' ? join(out, 'index.html') : join(out, `${path}.html`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, applySeo(base, path, seo));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env fica na raiz do repo. A chave pública do Turnstile aceita VITE_TURNSTILE_SITE_KEY ou TURNSTILE_SITE_KEY.
  const env = loadEnv(mode, envDir, '');
  const apiTarget = process.env.VITE_API_PROXY ?? env.VITE_API_PROXY ?? 'http://localhost:3000';
  const siteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? env.VITE_TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY ?? env.TURNSTILE_SITE_KEY ?? '';
  return {
  define: { 'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(siteKey), __APP_COMMIT__: JSON.stringify(gitSha(env)) },
  plugins: [react(), seoPages()],
  resolve: {
    // Usa o fonte de @tw/shared direto; dispensa build prévio do workspace.
    alias: { '@tw/shared': fileURLToPath(new URL('../shared/index.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      // link curto (E48): /l/<código> -> /api/l/<código>. Regex: a chave '/l' casaria com /login, /logo...
      '^/l/': { target: apiTarget, changeOrigin: true, rewrite: (p) => '/api' + p },
    },
  },
  // 'hidden': os mapas continuam gerados (depuração), mas o site publicado não aponta para eles
  build: { outDir: 'dist', sourcemap: 'hidden' },
};
});
