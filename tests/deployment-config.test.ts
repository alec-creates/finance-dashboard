import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Keeps the production safety rules of ADR-0011 from eroding: these files decide who can change the production
 * schema and when the app is deployed.
 */
const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
};
const release = read(".github/workflows/release-production.yml");
const ci = read(".github/workflows/ci.yml");
const vercel = JSON.parse(read("vercel.json")) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
  buildCommand?: string;
};

const SCHEMA_CHANGING =
  /migrate (deploy|dev|reset)|db push|db seed|db:migrate|db:seed|production:migrate/;

describe("application builds never touch the database schema", () => {
  it.each(["build", "postinstall", "start", "vercel-build"])(
    "the %s script does not migrate or seed",
    (name) => {
      expect(pkg.scripts[name] ?? "").not.toMatch(SCHEMA_CHANGING);
    },
  );

  it("Vercel uses the default build and never deploys main on its own", () => {
    expect(vercel.buildCommand).toBeUndefined();
    expect(vercel.git?.deploymentEnabled?.main).toBe(false);
  });

  it("CI never sees production secrets", () => {
    expect(ci).not.toMatch(/PRODUCTION_|environment:\s*production/);
  });
});

describe("the release workflow", () => {
  it("only starts by hand, on main, in the protected production environment", () => {
    expect(release).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(release).not.toMatch(
      /^\s+(push|pull_request|schedule|workflow_run):/m,
    );
    expect(release).toContain("if: github.ref == 'refs/heads/main'");
    expect(release).toContain("environment: production");
    expect(release).toMatch(/permissions:\n {2}contents: read/);
  });

  it("installs without install scripts and keeps the database secret out of the job environment", () => {
    expect(release).toContain("npm ci --ignore-scripts");
    const jobEnv = release.slice(
      release.indexOf("    env:"),
      release.indexOf("    steps:"),
    );
    expect(jobEnv).not.toContain("secrets.");
  });

  it("runs only the guarded production scripts against the database", () => {
    const commands = [...release.matchAll(/run: (npm run [\w:-]+)/g)].map(
      (match) => match[1],
    );
    expect(commands.sort()).toEqual(
      [
        "npm run db:production:check",
        "npm run db:production:migrate",
        "npm run db:production:verify-current",
      ].sort(),
    );
    expect(pkg.scripts["db:production:migrate"]).toBe(
      "tsx scripts/db.ts production migrate deploy",
    );
    // Prisma itself only generates the client here; database commands go through the guarded wrapper.
    const runLines = release
      .split("\n")
      .filter((line) => /^\s+(- )?run: /.test(line));
    expect(runLines.join("\n")).not.toMatch(/prisma (migrate|db) /);
    expect(runLines.some((line) => line.includes("npx prisma generate"))).toBe(
      true,
    );
  });

  it("requires a typed confirmation and checks main has not moved before deploying", () => {
    expect(release).toContain("inputs.confirm != 'release production'");
    expect(release).toContain('if [ "$head" != "$GITHUB_SHA" ]');
  });
});
