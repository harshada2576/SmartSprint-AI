import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig `paths` (`@/*` → `./src/*`) so API contract tests can
    // import source modules. Additive only; existing suites are unaffected.
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@supabase": path.resolve(process.cwd(), "supabase"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ["verbose"],
    env: {
      TZ: "UTC",
    },
  },
});
