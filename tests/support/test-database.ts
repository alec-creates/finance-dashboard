/**
 * Test-database access shared by the integration tests and the end-to-end tests. No test-runner imports, so both
 * Vitest and Playwright can load it. Every function re-checks that the configuration is the isolated test database.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createPrismaClient } from "../../src/server/db/client";
import { assertIsolatedTestDatabase } from "../../src/server/db/environment";
import { developmentUrls } from "../../src/server/db/load-env";

export function assertTestDatabase(): void {
  assertIsolatedTestDatabase({
    databaseEnv: process.env.DATABASE_ENV,
    databaseUrls: [process.env.DATABASE_URL, process.env.DIRECT_URL],
    forbiddenUrls: developmentUrls(),
  });
}

/** A client for the test database, created only after the isolation check passes. */
export function createTestPrisma(): PrismaClient {
  assertTestDatabase();
  return createPrismaClient(process.env.DATABASE_URL as string);
}

/**
 * Empties every application table in the test database's public schema (never other schemas, never migration
 * history). Re-checks isolation first, so it can never run against development.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) {
    return;
  }
  const list = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
