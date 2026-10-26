/**
 * Prints row counts (numbers only) for the main tables of the development or test database, inside a READ ONLY
 * transaction. Used to confirm what a command did, e.g. that tests never wrote to development.
 *
 *   npx tsx scripts/db-row-counts.ts development
 */
import pg from "pg";

import { normalizeConnectionString } from "../src/server/db/environment";
import {
  loadAndAssertDevelopmentDatabase,
  loadAndAssertTestDatabase,
} from "../src/server/db/load-env";

const TABLES = [
  "User",
  "FinancialAccount",
  "Transaction",
  "TransactionSplit",
  "InvestmentTransaction",
  "AssetPrice",
  "Budget",
];

async function main() {
  const target = process.argv[2];
  if (target === "development") {
    loadAndAssertDevelopmentDatabase();
  } else if (target === "test") {
    loadAndAssertTestDatabase();
  } else {
    throw new Error("Usage: tsx scripts/db-row-counts.ts <development|test>");
  }
  const client = new pg.Client({
    connectionString: normalizeConnectionString(process.env.DIRECT_URL ?? ""),
  });
  client.on("error", () => {});
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    for (const table of TABLES) {
      const { rows } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "${table}"`,
      );
      console.log(`  ${table.padEnd(24)} ${rows[0]?.count ?? 0}`);
    }
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  console.error(
    error instanceof Error && !code
      ? error.message
      : `Failed (code ${String(code)})`,
  );
  process.exit(1);
});
