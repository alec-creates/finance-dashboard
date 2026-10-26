import { expect } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { createTestPrisma, resetDatabase } from "../support/test-database";

export { createTestPrisma, resetDatabase };

/** Creates a user with an obviously synthetic email. */
export async function createUser(prisma: PrismaClient, label: string) {
  return prisma.user.create({
    data: {
      id: `test-user-${label}`,
      name: `Test ${label}`,
      email: `${label}@example.com`,
    },
  });
}

export async function createCheckingAccount(
  prisma: PrismaClient,
  userId: string,
  id = `${userId}-checking`,
) {
  return prisma.financialAccount.create({
    data: { id, userId, name: "Checking", type: "CHECKING" },
  });
}

export async function createCategory(
  prisma: PrismaClient,
  userId: string,
  name: string,
  parentId?: string,
) {
  return prisma.category.create({
    data: { userId, name, type: "EXPENSE", parentId: parentId ?? null },
  });
}

/** A transaction with one split, written atomically so the deferred split check passes. */
export async function createTransaction(
  prisma: PrismaClient,
  input: {
    userId: string;
    accountId: string;
    amountCents: number;
    categoryId?: string;
    date?: string;
  },
) {
  return prisma.transaction.create({
    data: {
      userId: input.userId,
      accountId: input.accountId,
      date: new Date(`${input.date ?? "2026-01-15"}T00:00:00Z`),
      amountCents: input.amountCents,
      description: "TEST TRANSACTION",
      kind: "EXPENSE",
      fingerprint: `fp-${Math.random()}`,
      splits: {
        create: [
          {
            amountCents: input.amountCents,
            categoryId: input.categoryId ?? null,
          },
        ],
      },
    },
  });
}

/**
 * Asserts that a database operation is rejected, matching the PostgreSQL error code or constraint name anywhere in
 * the error (Prisma wraps driver errors differently by operation).
 */
export async function expectRejected(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected the database to reject the operation").toBeDefined();
  const details = [
    String(caught),
    JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {})),
    JSON.stringify((caught as { meta?: unknown })?.meta ?? {}),
    JSON.stringify((caught as { cause?: unknown })?.cause ?? {}),
  ].join("\n");
  expect(details).toMatch(pattern);
}
