import { defineConfig, devices } from "@playwright/test";

import { loadAndAssertTestDatabase } from "./src/server/db/load-env";

/*
 * End-to-end smoke tests (npm run test:e2e). They run the production build against the TEST database only: the
 * configuration is loaded from .env.test.local and refused unless it is the isolated test database. Like the
 * integration tests they need database credentials, so they run locally, not in CI.
 */
loadAndAssertTestDatabase();

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // one owner account and real rate limits: run in order
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Built by `npm run test:e2e` first; served exactly as in production.
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: "production",
      BETTER_AUTH_URL: BASE_URL,
    },
  },
});
