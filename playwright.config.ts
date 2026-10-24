import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL: aponta para uma stack já no ar (padrão: compose dev em http://localhost:8080).
// E2E_WEB_SERVER=vite: sobe `vite preview` do front (porta 4173); a API real precisa estar em VITE_API_PROXY.
const useVite = process.env.E2E_WEB_SERVER === "vite";
const baseURL = process.env.E2E_BASE_URL ?? (useVite ? "http://localhost:4173" : "http://localhost:8080");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry", locale: "pt-BR" },
  projects: [
    { name: "mobile-375", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: useVite
    ? { command: "npm run -w @tw/web build && npm run -w @tw/web preview -- --port 4173 --strictPort", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
