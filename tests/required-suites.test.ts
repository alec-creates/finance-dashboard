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
