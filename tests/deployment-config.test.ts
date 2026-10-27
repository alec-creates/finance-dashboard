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
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
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

  it("Vercel uses the default build and never deploys from Git on its own", () => {
    expect(vercel.buildCommand).toBeUndefined();
    // All branches: production deploys come only from the release workflow, and there are no preview builds.
    expect(vercel.git?.deploymentEnabled).toBe(false);
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

  it("requires a typed confirmation and releases only the latest main, checked before migrating", () => {
    expect(release).toContain("inputs.confirm != 'release production'");
    const headCheck = release.indexOf('if [ "$head" != "$GITHUB_SHA" ]');
    expect(headCheck).toBeGreaterThan(-1);
    expect(headCheck).toBeLessThan(release.indexOf("db:production:check"));
  });

  it("deploys exactly this run's commit, after migrations, with the pinned Vercel CLI", () => {
    const deploy = release.slice(release.indexOf("Prepare a clean copy"));
    expect(release.indexOf("Prepare a clean copy")).toBeGreaterThan(
      release.indexOf("db:production:verify-current"),
    );
    expect(deploy).toContain(
      'git worktree add --detach "$RUNNER_TEMP/release" "$GITHUB_SHA"',
    );
    expect(deploy).toContain("working-directory: ${{ runner.temp }}/release");
    expect(deploy).toMatch(
      /run: npx --yes vercel@\d+\.\d+\.\d+ deploy --prod --yes --meta "githubCommitSha=\$GITHUB_SHA"\n/,
    );
  });

  it("never pulls production variables, builds locally or passes the token on the command line", () => {
    expect(release).not.toMatch(/vercel(@[\d.]+)? (pull|build)\b/);
    expect(release).not.toContain("--prebuilt");
    expect(release).not.toContain("--token");
    expect(release).not.toMatch(/DEPLOY_HOOK|curl /);
  });

  it("exposes each secret only to the steps that need it", () => {
    const steps = release.split(/\n {6}- /);
    const using = (secret: string) =>
      steps.filter((step) => step.includes(`secrets.${secret}`));
    expect(using("PRODUCTION_DIRECT_URL")).toHaveLength(3);
    for (const step of using("PRODUCTION_DIRECT_URL")) {
      expect(step).toMatch(/npm run db:production:/);
    }
    expect(using("VERCEL_TOKEN")).toHaveLength(1);
    expect(using("VERCEL_TOKEN")[0]).toContain("deploy --prod");
  });
});
