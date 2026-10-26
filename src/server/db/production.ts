/**
 * Guards for touching the production database (ADR-0011). Production migrations run only from the manually started,
 * approval-protected GitHub Actions workflow, only as `prisma migrate deploy`, and only after the database proves to
 * be the expected one. Errors and output never include connection strings, hosts, users or passwords.
 */
import { createHash } from "node:crypto";

import { databaseIdentity, DatabaseEnvironmentError } from "./environment";

/** The only Prisma commands ever allowed against production. */
export const PRODUCTION_COMMANDS = ["migrate deploy"] as const;

export const PRODUCTION_WORKFLOW = ".github/workflows/release-production.yml";

/** SHA-256 of the database identity (host without "-pooler", plus database name). Not secret, safe to store and log. */
export function databaseFingerprint(connectionString: string): string {
  return createHash("sha256")
    .update(databaseIdentity(connectionString))
    .digest("hex");
}

export interface ProductionContext {
  /** First characters of the fingerprint, for logs. */
  fingerprintPrefix: string;
}

/**
 * Throws unless every condition for a production migration holds:
 * - it runs in GitHub Actions, from the release workflow, on main;
 * - DATABASE_ENV is "production";
 * - DIRECT_URL is a direct (not pooled) postgresql:// connection;
 * - the database's fingerprint equals PRODUCTION_DATABASE_FINGERPRINT, so a wrong secret can't reach another database.
 */
export function assertProductionMigrationContext(
  source: Record<string, string | undefined>,
): ProductionContext {
  const fail = (message: string): never => {
    throw new DatabaseEnvironmentError(
      `Refusing production migration: ${message}`,
    );
  };
  if (source.GITHUB_ACTIONS !== "true") {
    fail("it only runs in the GitHub Actions release workflow");
  }
  if (!source.GITHUB_WORKFLOW_REF?.includes(PRODUCTION_WORKFLOW)) {
    fail("it only runs in the release workflow");
  }
  if (source.GITHUB_REF !== "refs/heads/main") {
    fail("it only runs on main");
  }
  if (source.DATABASE_ENV !== "production") {
    fail('DATABASE_ENV must be "production"');
  }
  const directUrl = source.DIRECT_URL;
  if (!directUrl) {
    return fail("DIRECT_URL is not set");
  }
  let host: string;
  try {
    host = new URL(directUrl).hostname;
  } catch {
    return fail("DIRECT_URL is not a valid connection string");
  }
  if (/-pooler\./i.test(host)) {
    fail("DIRECT_URL must be the direct connection, not the pooled one");
  }
  const expected = source.PRODUCTION_DATABASE_FINGERPRINT?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) {
    fail("PRODUCTION_DATABASE_FINGERPRINT is missing or malformed");
  }
  const actual = databaseFingerprint(directUrl);
  if (actual !== expected) {
    fail("the database does not match PRODUCTION_DATABASE_FINGERPRINT");
  }
  return { fingerprintPrefix: actual.slice(0, 12) };
}

export interface AppliedMigration {
  name: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface MigrationPlan {
  applied: string[];
  pending: string[];
  /** Started but neither finished nor rolled back: Prisma refuses to continue until resolved by hand. */
  failed: string[];
  /** Applied in the database but missing from this commit: the commit is older than the database. */
  unknown: string[];
}

/** Compares the migrations in this commit with the database's `_prisma_migrations` rows. */
export function planMigrations(
  local: readonly string[],
  database: readonly AppliedMigration[],
): MigrationPlan {
  const localSet = new Set(local);
  const finished = new Set(
    database
      .filter((row) => row.finishedAt !== null && row.rolledBackAt === null)
      .map((row) => row.name),
  );
  return {
    applied: [...local].filter((name) => finished.has(name)).sort(),
    pending: [...local].filter((name) => !finished.has(name)).sort(),
    failed: database
      .filter((row) => row.finishedAt === null && row.rolledBackAt === null)
      .map((row) => row.name)
      .sort(),
    unknown: [...finished].filter((name) => !localSet.has(name)).sort(),
  };
}

/** Why a plan must not be applied, or null when it is safe to run `migrate deploy`. */
export function planProblem(plan: MigrationPlan): string | null {
  if (plan.failed.length > 0) {
    return `the database has failed migrations (${plan.failed.join(", ")}); resolve them before deploying`;
  }
  if (plan.unknown.length > 0) {
    return `the database has migrations this commit doesn't know (${plan.unknown.join(", ")}); release from the latest main`;
  }
  return null;
}
