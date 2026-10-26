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

// Foreign-key violations: Prisma P2003 or PostgreSQL 23503.
const FOREIGN_KEY = /P2003|23503|foreign key/i;

describe("ownership is enforced by the database", () => {
  let alice: { id: string };
  let bob: { id: string };
  let aliceAccountId: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    alice = await createUser(prisma, "alice");
    bob = await createUser(prisma, "bob");
    aliceAccountId = (await createCheckingAccount(prisma, alice.id)).id;
  });

  it("rejects a transaction on another user's account", async () => {
    await expectRejected(
      createTransaction(prisma, {
        userId: bob.id,
        accountId: aliceAccountId,
        amountCents: -500,
      }),
      FOREIGN_KEY,
    );
  });

  it("rejects a split pointing at another user's category", async () => {
    const bobAccount = await createCheckingAccount(prisma, bob.id);
    const aliceCategory = await createCategory(prisma, alice.id, "Groceries");
    await expectRejected(
      createTransaction(prisma, {
        userId: bob.id,
        accountId: bobAccount.id,
        amountCents: -500,
        categoryId: aliceCategory.id,
      }),
      FOREIGN_KEY,
    );
  });

  it("rejects a contribution allocation into another user's account", async () => {
    const bobChecking = await createCheckingAccount(prisma, bob.id);
    const aliceBrokerage = await prisma.financialAccount.create({
      data: {
        userId: alice.id,
        name: "Brokerage",
        type: "INVESTMENT",
        investmentType: "TAXABLE_BROKERAGE",
      },
    });
    await expectRejected(
      prisma.contributionPlan.create({
        data: {
          userId: bob.id,
          name: "Plan",
          sourceAccountId: bobChecking.id,
          ruleType: "FIXED_AMOUNT",
          fixedAmountCents: 1000,
          schedule: { frequency: "monthly", dayOfMonth: 1 },
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          allocations: {
            create: [{ targetAccountId: aliceBrokerage.id, share: "1" }],
          },
        },
      }),
      FOREIGN_KEY,
    );
  });

  it("rejects a goal ledger entry against another user's goal", async () => {
    const goal = await prisma.savingsGoal.create({
      data: { userId: alice.id, name: "Goal", targetCents: 100_000 },
    });
    const bobAccount = await createCheckingAccount(prisma, bob.id);
    await expectRejected(
      prisma.goalLedgerEntry.create({
        data: {
          userId: bob.id,
          goalId: goal.id,
          accountId: bobAccount.id,
          date: new Date("2026-01-01T00:00:00Z"),
          amountCents: 100,
          type: "ALLOCATE",
        },
      }),
      FOREIGN_KEY,
    );
  });

  it("never lets a parent move to another user while it has children", async () => {
    await createTransaction(prisma, {
      userId: alice.id,
      accountId: aliceAccountId,
      amountCents: -500,
    });
    await expectRejected(
      prisma.financialAccount.update({
        where: { id: aliceAccountId },
        data: { userId: bob.id },
      }),
      FOREIGN_KEY,
    );
  });

  it("scopes reads by user", async () => {
    await createTransaction(prisma, {
      userId: alice.id,
      accountId: aliceAccountId,
      amountCents: -500,
    });
    expect(await prisma.transaction.count({ where: { userId: bob.id } })).toBe(
      0,
    );
    expect(
      await prisma.transaction.count({ where: { userId: alice.id } }),
    ).toBe(1);
  });
});
