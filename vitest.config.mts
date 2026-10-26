import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Database tests run separately (npm run test:integration) against the test database only.
    exclude: ["tests/integration/**", "node_modules/**"],
    // Financial calculations must never depend on the machine's time zone.
    env: { TZ: "UTC" },
    // A run that finds no tests is a failure, and tests/required-suites.test.ts fails when a critical suite is
    // missing or empty, so the suite can never pass by accident.
    passWithNoTests: false,
    allowOnly: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/app/**", "src/generated/**"],
      thresholds: {
        "src/lib/**": {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
      },
    },
  },
});
