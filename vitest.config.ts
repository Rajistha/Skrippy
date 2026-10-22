import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@tests": path.resolve(import.meta.dirname, "tests"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Tiap berkas yang memakai PGlite memuat Postgres WASM sendiri; terlalu banyak sekaligus membuat worker crash.
    maxWorkers: 4,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    coverage: { include: ["src/server/checkers/**", "src/server/services/access.ts"] },
  },
});
