import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createCheckingAccount,
  createTestPrisma,
  createTransaction,
  createUser,
  expectRejected,
  resetDatabase,
} from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const CHECK_VIOLATION = /23514|do not sum|has no splits|do not sum to 1/i;

describe("deferred invariants checked at commit", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createUser(prisma, "invariants")).id;
    accountId = (await createCheckingAccount(prisma, userId)).id;
  });

  it("accepts a transaction whose splits sum to its amount", async () => {
    const txn = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        date: new Date("2026-01-10T00:00:00Z"),
        amountCents: -10_000,
        description: "MIXED",
        kind: "EXPENSE",
        fingerprint: "fp",
        splits: { create: [{ amountCents: -6_000 }, { amountCents: -4_000 }] },
      },
      include: { splits: true },
    });
    expect(txn.splits).toHaveLength(2);
  });

  it("rejects a transaction without splits", async () => {
    await expectRejected(
      prisma.transaction.create({
        data: {
          userId,
          accountId,
          date: new Date("2026-01-10T00:00:00Z"),
          amountCents: -500,
          description: "NO SPLIT",
          kind: "EXPENSE",
          fingerprint: "fp",
        },
      }),
      CHECK_VIOLATION,
    );
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("rejects splits that do not add up", async () => {
    await expectRejected(
      prisma.transaction.create({
        data: {
          userId,
          accountId,
          date: new Date("2026-01-10T00:00:00Z"),
          amountCents: -10_000,
          description: "BAD",
          kind: "EXPENSE",
          fingerprint: "fp",
          splits: {
            create: [{ amountCents: -6_000 }, { amountCents: -3_999 }],
          },
        },
      }),
      CHECK_VIOLATION,
    );
  });

  it("rejects later edits that break the sum, and accepts edits that keep it", async () => {
    const txn = await createTransaction(prisma, {
      userId,
      accountId,
      amountCents: -2_500,
    });
    await expectRejected(
      prisma.transaction.update({
        where: { id: txn.id },
        data: { amountCents: -2_600 },
      }),
      CHECK_VIOLATION,
    );
    await expectRejected(
      prisma.transactionSplit.updateMany({
        where: { transactionId: txn.id },
        data: { amountCents: -2_400 },
      }),
      CHECK_VIOLATION,
    );
    // Re-split atomically: both changes are checked together at commit.
    await prisma.$transaction(async (tx) => {
      await tx.transactionSplit.deleteMany({
        where: { transactionId: txn.id },
      });
      await tx.transactionSplit.createMany({
        data: [
          { userId, transactionId: txn.id, amountCents: -1_000 },
          { userId, transactionId: txn.id, amountCents: -1_500 },
        ],
      });
    });
    expect(
      await prisma.transactionSplit.count({ where: { transactionId: txn.id } }),
    ).toBe(2);
  });

  it("requires contribution allocation shares to sum to exactly 1", async () => {
    const [brokerage, crypto] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          userId,
          name: "Brokerage",
          type: "INVESTMENT",
          investmentType: "TAXABLE_BROKERAGE",
        },
      }),
      prisma.financialAccount.create({
        data: {
          userId,
          name: "Crypto",
          type: "INVESTMENT",
          investmentType: "CRYPTO_EXCHANGE",
        },
      }),
    ]);
    const plan = {
      userId,
      name: "Weekly",
      sourceAccountId: accountId,
      ruleType: "PERCENT_OF_INCOME" as const,
      percent: "0.15",
      schedule: { frequency: "weekly", anchorDate: "2026-01-02" },
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    };
    await expectRejected(
      prisma.contributionPlan.create({
        data: {
          ...plan,
          allocations: {
            create: [
              { targetAccountId: brokerage.id, share: "0.7" },
              { targetAccountId: crypto.id, share: "0.2" },
            ],
          },
        },
      }),
      CHECK_VIOLATION,
    );
    const saved = await prisma.contributionPlan.create({
      data: {
        ...plan,
        allocations: {
          create: [
            { targetAccountId: brokerage.id, share: "0.7" },
            { targetAccountId: crypto.id, share: "0.3" },
          ],
        },
      },
    });
    await expectRejected(
      prisma.contributionAllocation.updateMany({
        where: { planId: saved.id, targetAccountId: crypto.id },
        data: { share: "0.4" },
      }),
      CHECK_VIOLATION,
    );
  });
});
