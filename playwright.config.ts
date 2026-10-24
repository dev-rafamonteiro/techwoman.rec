import { defineConfig, devices } from "@playwright/test";

// Lê o .env da raiz (se existir) sem imprimir nada; variáveis já exportadas têm precedência.
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  /* sem .env: usa o ambiente */
}

// Portas próprias do E2E, separadas da API/vite manuais (3000/5173).
const apiPort = process.env.E2E_API_PORT ?? "3100";
const webPort = process.env.E2E_WEB_PORT ?? "5180";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;
// Com E2E_BASE_URL apontando para uma stack já no ar (ex.: compose dev em :8080), não sobe servidores.
const startServers = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "on-first-retry", locale: "pt-BR" },
  projects: [
    { name: "mobile-375", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: startServers
    ? [
        {
          command: "npm run -w @tw/api start",
          url: `http://localhost:${apiPort}/ready`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            PORT: apiPort,
            MONGODB_URI: process.env.MONGODB_URI_TEST ?? "mongodb://localhost:27017/?directConnection=true",
            MONGODB_DB: "tw_e2e",
            EVENT_ID: "techwoman-2026",
            JWT_SECRET: "e2e-only-jwt-secret-0123456789abcdef0123456789",
            TURNSTILE_MODE: "test",
            EMAIL_PROVIDER: "console",
            WHATSAPP_ENABLED: "false",
            NODE_ENV: "test",
          },
        },
        {
          command: `npm run -w @tw/web dev -- --port ${webPort} --strictPort`,
          url: `http://localhost:${webPort}`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: { VITE_API_PROXY: `http://localhost:${apiPort}` },
        },
      ]
    : undefined,
});
