import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const domain = fileURLToPath(new URL("../src/api/domain/index.ts", import.meta.url));
const alias = { "@tw/api/domain": domain };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          alias,
          include: ["unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          alias,
          include: ["integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
