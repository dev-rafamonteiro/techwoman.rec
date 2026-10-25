import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig(({ mode }) => {
  // .env fica na raiz do repo. A chave pública do Turnstile aceita VITE_TURNSTILE_SITE_KEY ou TURNSTILE_SITE_KEY.
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const siteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? env.VITE_TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY ?? env.TURNSTILE_SITE_KEY ?? '';
  return {
  define: { 'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(siteKey) },
  plugins: [react()],
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
  build: { outDir: 'dist', sourcemap: true },
};
});
