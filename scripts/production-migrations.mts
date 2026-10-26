/**
 * Read-only preflight and postflight for production migrations (ADR-0011). Runs only inside the release workflow.
 *
 *   tsx scripts/production-migrations.mts check                 # before: identity, failed or unknown migrations
 *   tsx scripts/production-migrations.mts check --expect-current # after: nothing may be pending
 *
 * It signs in with DIRECT_URL inside a READ ONLY transaction, compares this commit's migrations with the database's
 * `_prisma_migrations` table, and prints only migration names, counts and the first characters of the database
 * fingerprint. Connection strings, hosts, users and passwords are never printed.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

import { normalizeConnectionString } from "../src/server/db/environment";
import {
  assertProductionMigrationContext,
  planMigrations,
  planProblem,
  type AppliedMigration,
} from "../src/server/db/production";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [command, flag] = process.argv.slice(2);
if (
  command !== "check" ||
  (flag !== undefined && flag !== "--expect-current")
) {
  fail("Usage: tsx scripts/production-migrations.mts check [--expect-current]");
}

let context: { fingerprintPrefix: string };
try {
  context = assertProductionMigrationContext(process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : "Production checks failed");
}
console.log(
  `Database fingerprint ${context.fingerprintPrefix}… matches the expected production database.`,
);

const local = readdirSync(join(process.cwd(), "prisma", "migrations"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Driver errors are described by code only: their messages can contain a host or role name. */
function describe(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string"
    ? `database error (code ${code})`
    : "database connection failed";
}

const client = new pg.Client({
  connectionString: normalizeConnectionString(process.env.DIRECT_URL as string),
  connectionTimeoutMillis: 20_000, // a Neon compute may be waking from scale-to-zero
  query_timeout: 15_000,
});
client.on("error", () => {});

let applied: AppliedMigration[] = [];
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const table = await client.query<{ exists: boolean }>(
    "select to_regclass('public._prisma_migrations') is not null as exists",
  );
  if (table.rows[0]?.exists) {
    const rows = await client.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      "select migration_name, finished_at, rolled_back_at from public._prisma_migrations",
    );
    applied = rows.rows.map((row) => ({
      name: row.migration_name,
      finishedAt: row.finished_at,
      rolledBackAt: row.rolled_back_at,
    }));
  }
  await client.query("ROLLBACK");
} catch (error) {
  fail(`Could not read the migration history: ${describe(error)}`);
} finally {
  await client.end().catch(() => {});
}

const plan = planMigrations(local, applied);
console.log(
  `Applied: ${plan.applied.length} of ${local.length} migrations in this commit.`,
);
console.log(
  plan.pending.length === 0
    ? "Pending: none."
    : `Pending (${plan.pending.length}): ${plan.pending.join(", ")}`,
);
const problem = planProblem(plan);
if (problem) {
  fail(`Refusing: ${problem}.`);
}
if (flag === "--expect-current" && plan.pending.length > 0) {
  fail("Refusing: migrations are still pending after deploy.");
}
