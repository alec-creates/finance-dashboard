import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseCalendarDate } from "../../src/lib/dates";
import { generateSyntheticDataset } from "../../src/server/synthetic/generate";
import { persistSyntheticDataset } from "../../src/server/synthetic/persist";

import { createTestPrisma, resetDatabase } from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

describe("synthetic dataset in the test database", () => {
  const dataset = generateSyntheticDataset({
    userId: "test-synthetic",
    email: "synthetic@example.com",
    endDate: parseCalendarDate("2026-09-30"),
  });
  const userId = "test-synthetic";

  beforeAll(async () => {
    await resetDatabase(prisma);
    await persistSyntheticDataset(prisma, dataset);
  });

  it("stores every generated record", async () => {
    expect(await prisma.transaction.count({ where: { userId } })).toBe(
      dataset.transactions.length,
    );
    expect(await prisma.transactionSplit.count({ where: { userId } })).toBe(
      dataset.splits.length,
    );
    expect(
      await prisma.investmentTransaction.count({ where: { userId } }),
    ).toBe(dataset.investmentTransactions.length);
    expect(await prisma.holdingSnapshot.count({ where: { userId } })).toBe(
      dataset.holdingSnapshots.length,
    );
    expect(await prisma.budget.count({ where: { userId } })).toBe(
      dataset.budgets.length,
    );
  });

  it("passes the integrity queries", async () => {
    const [unbalanced] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "Transaction" t
      WHERE t."amountCents" <> (SELECT COALESCE(SUM(s."amountCents"), 0) FROM "TransactionSplit" s WHERE s."transactionId" = t.id)`;
    expect(unbalanced?.count).toBe(0);

    const [openPairs] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "transferPairId" FROM "Transaction"
        WHERE "transferPairId" IS NOT NULL AND kind IN ('TRANSFER', 'CREDIT_CARD_PAYMENT')
        GROUP BY "transferPairId" HAVING SUM("amountCents") <> 0 OR COUNT(*) <> 2) unbalanced_pairs`;
    expect(openPairs?.count).toBe(0);

    const [shares] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "planId" FROM "ContributionAllocation" GROUP BY "planId" HAVING SUM(share) <> 1) bad_plans`;
    expect(shares?.count).toBe(0);
  });

  it("computes this month's spending from signed splits, refunds included", async () => {
    const [row] = await prisma.$queryRaw<{ spending: number }[]>`
      SELECT (-COALESCE(SUM(s."amountCents"), 0))::int AS spending
      FROM "TransactionSplit" s JOIN "Transaction" t ON t.id = s."transactionId"
      WHERE t."userId" = ${userId} AND t.kind IN ('EXPENSE', 'REFUND') AND NOT t."excludeFromBudget"
        AND t.date >= DATE '2026-09-01' AND t.date <= DATE '2026-09-30'`;
    const expected = -dataset.transactions
      .filter(
        (txn) =>
          (txn.kind === "EXPENSE" || txn.kind === "REFUND") &&
          String((txn.date as Date).toISOString()).startsWith("2026-09"),
      )
      .reduce((sum, txn) => sum + txn.amountCents, 0);
    expect(row?.spending).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("re-seeding replaces the synthetic user's data instead of duplicating it", async () => {
    await persistSyntheticDataset(prisma, dataset);
    expect(await prisma.transaction.count({ where: { userId } })).toBe(
      dataset.transactions.length,
    );
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });
});
