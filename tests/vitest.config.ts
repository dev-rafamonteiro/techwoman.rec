import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["integration/**/*.test.ts"],
          environment: "node",
          // cada arquivo usa um banco isolado; arquivos em paralelo, testes dentro do arquivo em sequência
          fileParallelism: true,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
