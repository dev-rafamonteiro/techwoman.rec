import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Lê o .env da raiz (se existir) sem imprimir nada; variáveis já exportadas têm precedência.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  /* sem .env: usa o ambiente */
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
// Com E2E_BASE_URL apontando para uma stack já no ar (ex.: compose dev em :8080), não sobe servidores.
const startServers = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "on-first-retry", locale: "pt-BR" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: startServers
    ? [
        {
          command: "npm run -w @tw/api start",
          cwd: "..",
          url: "http://localhost:3000/ready",
          reuseExistingServer: true,
          timeout: 60_000,
          env: {
            PORT: "3000",
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
          command: "npm run -w @tw/web dev -- --port 5173 --strictPort",
          cwd: "..",
          url: "http://localhost:5173",
          reuseExistingServer: true,
          timeout: 60_000,
          env: { VITE_API_PROXY: "http://localhost:3000" },
        },
      ]
    : undefined,
});
