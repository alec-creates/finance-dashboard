import { spawnSync } from "node:child_process";

import { loadAndAssertTestDatabase } from "../../src/server/db/load-env";

/**
 * Runs once before the integration suite: verifies the target is the isolated test database, then applies pending
 * migrations to it with the non-destructive `migrate deploy` (through scripts/db.ts, which checks again).
 */
export default function setup(): void {
  try {
    loadAndAssertTestDatabase();
  } catch (error) {
    // Print the reason directly: Vitest's stack-trace formatting can hide errors thrown from global setup.
    const message =
      error instanceof Error ? error.message : "Test database check failed";
    console.error(`\n[integration tests] ${message}\n`);
    throw new Error(message);
  }
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/db.ts", "test", "migrate", "deploy"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error("Applying migrations to the test database failed");
  }
}
