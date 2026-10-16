import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app's tsconfig uses `jsx: preserve` (Next compiles it); tests need real JSX output.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside Next's server bundler; tests run on the server side.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
    // The SQLite-backed tests each use their own disposable file, but keep runs predictable.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
