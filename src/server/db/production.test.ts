import { describe, expect, it } from "vitest";

import {
  assertProductionMigrationContext,
  databaseFingerprint,
  planMigrations,
  planProblem,
} from "./production";

// Invented connection strings; no real hosts or credentials.
const DIRECT =
  "postgresql://owner:pw@ep-calm-sky-123.us-east-2.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow
const POOLED =
  "postgresql://owner:pw@ep-calm-sky-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"; // gitleaks:allow
const OTHER =
  "postgresql://owner:pw@ep-other-db-456.us-east-2.aws.neon.tech/neondb"; // gitleaks:allow

function context(overrides: Record<string, string | undefined> = {}) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW_REF:
      "owner/repo/.github/workflows/release-production.yml@refs/heads/main",
    GITHUB_REF: "refs/heads/main",
    DATABASE_ENV: "production",
    DIRECT_URL: DIRECT,
    PRODUCTION_DATABASE_FINGERPRINT: databaseFingerprint(DIRECT),
    ...overrides,
  };
}

describe("databaseFingerprint", () => {
  it("is the same for the pooled and direct strings of one database and differs between databases", () => {
    expect(databaseFingerprint(DIRECT)).toMatch(/^[0-9a-f]{64}$/);
    expect(databaseFingerprint(POOLED)).toBe(databaseFingerprint(DIRECT));
    expect(databaseFingerprint(OTHER)).not.toBe(databaseFingerprint(DIRECT));
  });

  it("does not depend on the user name or password", () => {
    expect(
      databaseFingerprint(DIRECT.replace("owner:pw", "other:secret")),
    ).toBe(databaseFingerprint(DIRECT));
  });
});

describe("assertProductionMigrationContext", () => {
  it("accepts the release workflow on main with the expected database", () => {
    expect(assertProductionMigrationContext(context())).toEqual({
      fingerprintPrefix: databaseFingerprint(DIRECT).slice(0, 12),
    });
  });

  it.each([
    ["outside GitHub Actions", { GITHUB_ACTIONS: undefined }, /GitHub Actions/],
    [
      "from another workflow",
      {
        GITHUB_WORKFLOW_REF:
          "owner/repo/.github/workflows/ci.yml@refs/heads/main",
      },
      /release workflow/,
    ],
    ["on another branch", { GITHUB_REF: "refs/heads/feature" }, /main/],
    [
      "with a non-production DATABASE_ENV",
      { DATABASE_ENV: "test" },
      /DATABASE_ENV/,
    ],
    ["without DIRECT_URL", { DIRECT_URL: undefined }, /DIRECT_URL is not set/],
    [
      "with a malformed DIRECT_URL",
      { DIRECT_URL: "not a url" },
      /valid connection/,
    ],
    ["with the pooled connection", { DIRECT_URL: POOLED }, /not the pooled/],
    [
      "without a fingerprint",
      { PRODUCTION_DATABASE_FINGERPRINT: undefined },
      /missing or malformed/,
    ],
    [
      "when the database is not the expected one",
      { DIRECT_URL: OTHER },
      /does not match/,
    ],
  ])("refuses %s", (_label, overrides, message) => {
    expect(() => assertProductionMigrationContext(context(overrides))).toThrow(
      message,
    );
  });

  it("never puts connection details in its errors", () => {
    try {
      assertProductionMigrationContext(context({ DIRECT_URL: OTHER }));
    } catch (error) {
      const text = String(error);
      expect(text).not.toMatch(/neon\.tech|owner|pw|ep-other/);
    }
  });
});

describe("planMigrations", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  const local = ["20261026_a", "20261027_b", "20261028_c"];

  it("lists applied and pending migrations", () => {
    const plan = planMigrations(local, [
      { name: "20261026_a", finishedAt: at, rolledBackAt: null },
    ]);
    expect(plan).toEqual({
      applied: ["20261026_a"],
      pending: ["20261027_b", "20261028_c"],
      failed: [],
      unknown: [],
    });
    expect(planProblem(plan)).toBeNull();
  });

  it("treats a fresh database as everything pending", () => {
    expect(planMigrations(local, []).pending).toEqual(local);
  });

  it("refuses when a migration failed", () => {
    const plan = planMigrations(local, [
      { name: "20261026_a", finishedAt: at, rolledBackAt: null },
      { name: "20261027_b", finishedAt: null, rolledBackAt: null },
    ]);
    expect(plan.failed).toEqual(["20261027_b"]);
    expect(planProblem(plan)).toMatch(/failed migrations/);
  });

  it("treats a rolled-back attempt as pending, not failed", () => {
    const plan = planMigrations(local, [
      { name: "20261027_b", finishedAt: null, rolledBackAt: at },
    ]);
    expect(plan.failed).toEqual([]);
    expect(plan.pending).toContain("20261027_b");
  });

  it("refuses when the database is ahead of this commit", () => {
    const plan = planMigrations(local.slice(0, 1), [
      { name: "20261026_a", finishedAt: at, rolledBackAt: null },
      { name: "20261027_b", finishedAt: at, rolledBackAt: null },
    ]);
    expect(plan.unknown).toEqual(["20261027_b"]);
    expect(planProblem(plan)).toMatch(/doesn't know/);
  });
});
