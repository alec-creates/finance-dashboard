import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard against tests silently disappearing: a renamed, deleted or emptied suite for critical financial logic makes
 * the run fail instead of passing with fewer tests. Add new critical suites here when they are created.
 */
const REQUIRED_SUITES = [
  "src/lib/money.test.ts",
  "src/lib/decimal.test.ts",
  "src/lib/percent.test.ts",
  "src/lib/investments.test.ts",
  "src/lib/dates.test.ts",
  "src/lib/schedules.test.ts",
  "src/lib/contributions.test.ts",
  "src/lib/accounts.test.ts",
  "src/lib/account-forms.test.ts",
  "src/lib/transactions.test.ts",
  "src/lib/transaction-forms.test.ts",
  "src/server/db/environment.test.ts",
  "src/server/env.test.ts",
  "src/server/synthetic/generate.test.ts",
  // Database integration suites (run with npm run test:integration against the test database).
  "tests/integration/isolation.test.ts",
  "tests/integration/ownership.test.ts",
  "tests/integration/constraints.test.ts",
  "tests/integration/invariants.test.ts",
  "tests/integration/delete-behaviour.test.ts",
  "tests/integration/precision.test.ts",
  "tests/integration/synthetic-data.test.ts",
  "src/server/auth/auth-unit.test.ts",
  "src/proxy.test.ts",
  "tests/integration/auth.test.ts",
  "tests/integration/auth-api.test.ts",
  "tests/integration/accounts.test.ts",
  "tests/integration/transactions.test.ts",
] as const;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("required test suites", () => {
  it.each(REQUIRED_SUITES)("%s exists and contains tests", (suite) => {
    const path = `${repoRoot}${suite}`;
    expect(existsSync(path), `${suite} is missing`).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source, `${suite} has no tests`).toMatch(
      /\b(?:it|test)(?:\.each\([^)]*\))?\(/,
    );
    expect(source, `${suite} uses .only or .skip`).not.toMatch(
      /\b(?:it|test|describe)\.(?:only|skip)\b/,
    );
  });
});
