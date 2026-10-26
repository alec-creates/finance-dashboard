import { afterAll, describe, expect, it } from "vitest";

import { databaseIdentity } from "../../src/server/db/environment";
import { developmentUrls } from "../../src/server/db/load-env";

import { createTestPrisma } from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

describe("test database isolation", () => {
  it("runs only with DATABASE_ENV=test", () => {
    expect(process.env.DATABASE_ENV).toBe("test");
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("never points at the development database", () => {
    const testIdentities = [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
    ].map((url) => databaseIdentity(url ?? ""));
    for (const devUrl of developmentUrls()) {
      expect(testIdentities).not.toContain(databaseIdentity(devUrl));
    }
  });

  it("has the migrations applied", async () => {
    const rows = await prisma.$queryRaw<
      { migration_name: string; finished: boolean }[]
    >`
      SELECT migration_name, finished_at IS NOT NULL AS finished FROM "_prisma_migrations"`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.finished)).toBe(true);
  });
});
