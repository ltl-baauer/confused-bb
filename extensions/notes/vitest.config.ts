import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      {
        find: "@bb/plugin-sdk/testing",
        replacement: resolve(
          repositoryRoot,
          "packages/plugin-sdk/src/testing/index.ts",
        ),
      },
      {
        find: "@bb/plugin-sdk",
        replacement: resolve(repositoryRoot, "packages/plugin-sdk/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["server.test.ts"],
  },
});
