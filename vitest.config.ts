import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The `@/` alias belongs to apps/web; packages and the other apps use relative or workspace imports.
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The D1 adapter tests start a real workerd (Miniflare) for each test; a cold start alone takes
    // seconds on a busy machine, so the default 5 s fails them without anything being wrong.
    testTimeout: 15_000,
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "packages/*/src/**/*.ts",
        "apps/{mcp,jobs}/src/**/*.ts",
        "apps/web/src/{lib,server}/**/*.ts",
      ],
    },
  },
});
