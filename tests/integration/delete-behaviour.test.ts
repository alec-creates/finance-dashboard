import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createCategory,
  createCheckingAccount,
  createTestPrisma,
  createTransaction,
  createUser,
  expectRejected,
  resetDatabase,
} from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const BLOCKED = /P2003|23503|foreign key/i;

describe("delete behaviour", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createUser(prisma, "deletes")).id;
    accountId = (await createCheckingAccount(prisma, userId)).id;
  });

  it("deleting a user removes everything they own", async () => {
    const category = await createCategory(prisma, userId, "Groceries");
    await createTransaction(prisma, {
      userId,
      accountId,
      amountCents: -1_000,
      categoryId: category.id,
    });
    await prisma.savingsGoal.create({
      data: { userId, name: "Goal", targetCents: 1_000 },
    });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.transactionSplit.count()).toBe(0);
    expect(await prisma.financialAccount.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.savingsGoal.count()).toBe(0);
  });

  it("refuses to delete an account, category or merchant that history refers to (archive instead)", async () => {
    const category = await createCategory(prisma, userId, "Groceries");
    await createTransaction(prisma, {
      userId,
      accountId,
      amountCents: -1_000,
      categoryId: category.id,
    });
    await expectRejected(
      prisma.financialAccount.delete({ where: { id: accountId } }),
      BLOCKED,
    );
    await expectRejected(
      prisma.category.delete({ where: { id: category.id } }),
      BLOCKED,
    );
    await prisma.financialAccount.update({
      where: { id: accountId },
      data: { archivedAt: new Date() },
    });
  });

  it("deleting a transaction removes its splits", async () => {
    const txn = await createTransaction(prisma, {
      userId,
      accountId,
      amountCents: -1_000,
    });
    await prisma.transaction.delete({ where: { id: txn.id } });
    expect(await prisma.transactionSplit.count()).toBe(0);
  });

  it("undoing an import deletes the batch's transactions and splits", async () => {
    const batch = await prisma.importBatch.create({
      data: { userId, accountId, source: "CSV", adapterId: "generic" },
    });
    for (const amountCents of [-1_000, -2_000]) {
      await prisma.transaction.create({
        data: {
          userId,
          accountId,
          importBatchId: batch.id,
          date: new Date("2026-01-05T00:00:00Z"),
          amountCents,
          description: "IMPORTED",
          kind: "EXPENSE",
          fingerprint: `fp${amountCents}`,
          splits: { create: [{ amountCents }] },
        },
      });
    }
    const kept = await createTransaction(prisma, {
      userId,
      accountId,
      amountCents: -500,
    });
    await prisma.importBatch.delete({ where: { id: batch.id } });
    expect(await prisma.transaction.count()).toBe(1);
    expect((await prisma.transaction.findFirst())?.id).toBe(kept.id);
    expect(await prisma.transactionSplit.count()).toBe(1);
  });
});
