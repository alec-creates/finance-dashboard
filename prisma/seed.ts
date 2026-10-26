/**
 * Seeds the development database with synthetic data only. Run with `npm run db:seed`, which checks first that the
 * target is the development database (scripts/db.ts). Re-running replaces the synthetic user's data.
 */
import { createPrismaClient } from "../src/server/db/client";
import {
  assertDatabaseEnvironment,
  assertIsolatedTestDatabase,
} from "../src/server/db/environment";
import { developmentUrls, testUrls } from "../src/server/db/load-env";
import { addDays, todayInTimeZone } from "../src/lib/dates";
import { generateSyntheticDataset } from "../src/server/synthetic/generate";
import { persistSyntheticDataset } from "../src/server/synthetic/persist";

async function main() {
  if (process.env.FINANCE_DB_GUARD !== "1") {
    throw new Error(
      "Run the seed through `npm run db:seed`, which verifies the target database.",
    );
  }
  const target = process.env.DATABASE_ENV;
  if (target === "test") {
    assertIsolatedTestDatabase({
      databaseEnv: target,
      databaseUrls: [process.env.DATABASE_URL, process.env.DIRECT_URL],
      forbiddenUrls: developmentUrls(),
    });
  } else {
    assertDatabaseEnvironment("development", target);
    assertIsolatedTestDatabase({
      databaseEnv: "test",
      databaseUrls: [process.env.DATABASE_URL, process.env.DIRECT_URL],
      forbiddenUrls: testUrls(),
    });
  }

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL is not set");
  }
  const prisma = createPrismaClient(connectionString);
  try {
    const dataset = generateSyntheticDataset({
      userId: "synthetic-demo-user",
      email: "demo@example.com",
      endDate: addDays(todayInTimeZone("America/New_York"), -1),
    });
    const started = Date.now();
    const { counts } = await persistSyntheticDataset(prisma, dataset);
    console.log(
      `Seeded synthetic data into the ${target} database in ${((Date.now() - started) / 1000).toFixed(1)}s:`,
    );
    for (const [name, count] of Object.entries(counts)) {
      console.log(`  ${name.padEnd(24)} ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seeding failed");
  process.exit(1);
});
