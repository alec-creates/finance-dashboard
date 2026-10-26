import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database integration tests. They run only against the test database (.env.test.local, DATABASE_ENV=test) and
// refuse to start otherwise; see tests/integration/global-setup.ts. Not part of `npm test` or CI, which have no
// database credentials.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: { TZ: "UTC", NODE_ENV: "test" },
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // One shared database: run files one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 600_000,
    passWithNoTests: false,
    allowOnly: false,
  },
});
