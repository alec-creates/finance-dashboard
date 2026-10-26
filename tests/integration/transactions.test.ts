import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  parseCalendarDate,
  parseYearMonth,
  toDatabaseDate,
} from "../../src/lib/dates";
import type { TransactionInput } from "../../src/lib/transaction-forms";
import {
  createCategory,
  ensureStarterCategories,
  listCategoryTree,
  setCategoryArchived,
  STARTER_CATEGORIES,
  updateCategory,
} from "../../src/server/services/categories";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "../../src/server/services/transactions";

import { createTestPrisma, createUser, resetDatabase } from "./helpers";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const OCTOBER = parseYearMonth("2026-10");

let alice: { id: string };
let bob: { id: string };
let checking: string;
let card: string;

async function account(
  userId: string,
  type: "CHECKING" | "CREDIT_CARD",
  name: string,
) {
  return (
    await prisma.financialAccount.create({
      data: { userId, name, type },
      select: { id: true },
    })
  ).id;
}

async function category(userId: string, name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, name } }))
    .id;
}

/** Invented transaction with one uncategorized split unless splits are given. */
function txn(overrides: Partial<TransactionInput> = {}): TransactionInput {
  const amountCents = overrides.amountCents ?? -4_250;
  return {
    accountId: checking,
    date: parseCalendarDate("2026-10-15"),
    description: "TEST PURCHASE",
    kind: "EXPENSE",
    amountCents,
    notes: null,
    splits: [{ categoryId: null, amountCents }],
    ...overrides,
  };
}

async function create(userId: string, input: TransactionInput) {
  const result = await createTransaction(prisma, userId, input);
  if (!result.ok) {
    throw new Error(`create failed: ${result.reason}`);
  }
  return result.value.id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  alice = await createUser(prisma, "alice");
  bob = await createUser(prisma, "bob");
  checking = await account(alice.id, "CHECKING", "Checking");
  card = await account(alice.id, "CREDIT_CARD", "Card");
  await ensureStarterCategories(prisma, alice.id);
});

describe("starter categories", () => {
  it("creates a two-level set once, with children typed like their parents", async () => {
    const tree = await listCategoryTree(prisma, alice.id);
    expect(tree.map((parent) => parent.name)).toEqual(
      STARTER_CATEGORIES.map((parent) => parent.name),
    );
    for (const parent of tree) {
      expect(parent.parentId).toBeNull();
      for (const child of parent.children) {
        expect(child.type).toBe(parent.type);
        expect(child.children).toEqual([]);
      }
    }
    expect(await ensureStarterCategories(prisma, alice.id)).toBe(false);
    const total = STARTER_CATEGORIES.reduce(
      (sum, parent) => sum + 1 + parent.children.length,
      0,
    );
    expect(await prisma.category.count({ where: { userId: alice.id } })).toBe(
      total,
    );
  });

  it("is not refilled once the owner has categories, even if all are archived", async () => {
    await prisma.category.updateMany({
      where: { userId: alice.id },
      data: { archivedAt: new Date() },
    });
    expect(await ensureStarterCategories(prisma, alice.id)).toBe(false);
  });
});

describe("managing categories", () => {
  it("adds a subcategory with its parent's type and rejects duplicate names case-insensitively", async () => {
    const food = await category(alice.id, "Food");
    const added = await createCategory(prisma, alice.id, {
      name: "Coffee",
      type: "INCOME", // ignored: subcategories take their parent's type
      parentId: food,
      isEssential: false,
    });
    expect(added.ok).toBe(true);
    const coffee = await prisma.category.findFirstOrThrow({
      where: { userId: alice.id, name: "Coffee" },
    });
    expect(coffee.type).toBe("EXPENSE");

    expect(
      await createCategory(prisma, alice.id, {
        name: "GROCERIES",
        type: "EXPENSE",
        parentId: food,
        isEssential: false,
      }),
    ).toEqual({ ok: false, reason: "duplicate-name" });
    // The same name under another parent is fine.
    expect(
      (
        await createCategory(prisma, alice.id, {
          name: "Groceries",
          type: "EXPENSE",
          parentId: await category(alice.id, "Personal"),
          isEssential: false,
        })
      ).ok,
    ).toBe(true);
  });

  it("allows only two levels", async () => {
    expect(
      await createCategory(prisma, alice.id, {
        name: "Organic",
        type: "EXPENSE",
        parentId: await category(alice.id, "Groceries"),
        isEssential: false,
      }),
    ).toEqual({ ok: false, reason: "invalid-parent" });
  });

  it("renames, marks essential, and archives children before parents", async () => {
    const restaurants = await category(alice.id, "Restaurants");
    expect(
      await updateCategory(prisma, alice.id, restaurants, {
        name: "Eating out",
        isEssential: true,
      }),
    ).toEqual({ ok: true, value: undefined });

    const food = await category(alice.id, "Food");
    expect(await setCategoryArchived(prisma, alice.id, food, true)).toEqual({
      ok: false,
      reason: "has-active-children",
    });
    for (const child of ["Groceries", "Eating out"]) {
      await setCategoryArchived(
        prisma,
        alice.id,
        await category(alice.id, child),
        true,
      );
    }
    expect((await setCategoryArchived(prisma, alice.id, food, true)).ok).toBe(
      true,
    );
    expect(
      await setCategoryArchived(
        prisma,
        alice.id,
        await category(alice.id, "Groceries"),
        false,
      ),
    ).toEqual({ ok: false, reason: "parent-archived" });
  });
});

describe("totals by kind", () => {
  it("counts a card purchase once and never the card payment, on either account", async () => {
    await create(
      alice.id,
      txn({
        kind: "INCOME",
        amountCents: 300_000,
        splits: [{ categoryId: null, amountCents: 300_000 }],
      }),
    );
    await create(alice.id, txn({ accountId: card, amountCents: -12_500 }));
    await create(
      alice.id,
      txn({
        kind: "CREDIT_CARD_PAYMENT",
        amountCents: -12_500,
        splits: [{ categoryId: null, amountCents: -12_500 }],
      }),
    );
    await create(
      alice.id,
      txn({
        accountId: card,
        kind: "CREDIT_CARD_PAYMENT",
        amountCents: 12_500,
        splits: [{ categoryId: null, amountCents: 12_500 }],
      }),
    );
    const { totals } = await listTransactions(prisma, alice.id, {
      month: OCTOBER,
    });
    expect(totals).toEqual({
      incomeCents: 300_000,
      spendingCents: 12_500,
      netCents: 287_500,
      excludedCount: 2,
    });
  });

  it("lets refunds reduce spending and leaves transfers out", async () => {
    await create(alice.id, txn({ amountCents: -8_000 }));
    await create(
      alice.id,
      txn({
        kind: "REFUND",
        amountCents: 3_000,
        splits: [{ categoryId: null, amountCents: 3_000 }],
      }),
    );
    await create(
      alice.id,
      txn({
        kind: "TRANSFER",
        amountCents: -50_000,
        splits: [{ categoryId: null, amountCents: -50_000 }],
      }),
    );
    const { totals } = await listTransactions(prisma, alice.id, {
      month: OCTOBER,
    });
    expect(totals).toMatchObject({
      incomeCents: 0,
      spendingCents: 5_000,
      excludedCount: 1,
    });
  });

  it("filters by calendar month and by account", async () => {
    await create(
      alice.id,
      txn({
        date: parseCalendarDate("2026-10-31"),
        amountCents: -100,
        splits: [{ categoryId: null, amountCents: -100 }],
      }),
    );
    await create(
      alice.id,
      txn({
        date: parseCalendarDate("2026-11-01"),
        amountCents: -200,
        splits: [{ categoryId: null, amountCents: -200 }],
      }),
    );
    await create(
      alice.id,
      txn({
        accountId: card,
        date: parseCalendarDate("2026-10-01"),
        amountCents: -400,
        splits: [{ categoryId: null, amountCents: -400 }],
      }),
    );

    const october = await listTransactions(prisma, alice.id, {
      month: OCTOBER,
    });
    expect(october.rows.map((row) => row.date)).toEqual([
      "2026-10-31",
      "2026-10-01",
    ]);
    const cardOnly = await listTransactions(prisma, alice.id, {
      month: OCTOBER,
      accountId: card,
    });
    expect(cardOnly.totals.spendingCents).toBe(400);
  });
});

describe("splits", () => {
  it("stores a three-way split to the cent", async () => {
    const groceries = await category(alice.id, "Groceries");
    const pharmacy = await category(alice.id, "Pharmacy");
    const shopping = await category(alice.id, "Shopping");
    const id = await create(
      alice.id,
      txn({
        amountCents: -10_000,
        splits: [
          { categoryId: groceries, amountCents: -3_334 },
          { categoryId: pharmacy, amountCents: -3_333 },
          { categoryId: shopping, amountCents: -3_333 },
        ],
      }),
    );
    const stored = await getTransaction(prisma, alice.id, id);
    expect(
      stored?.splits.map((split) => [split.category?.name, split.amountCents]),
    ).toEqual([
      ["Groceries", -3_334],
      ["Pharmacy", -3_333],
      ["Shopping", -3_333],
    ]);
    expect(stored?.splits[0]?.category?.parentName).toBe("Food");
  });

  it("refuses splits that don't sum, have the wrong sign, or a mismatched kind and sign", async () => {
    for (const input of [
      txn({
        amountCents: -10_000,
        splits: [{ categoryId: null, amountCents: -9_999 }],
      }),
      txn({
        amountCents: -10_000,
        splits: [
          { categoryId: null, amountCents: -12_000 },
          { categoryId: null, amountCents: 2_000 },
        ],
      }),
      txn({
        kind: "INCOME",
        amountCents: -500,
        splits: [{ categoryId: null, amountCents: -500 }],
      }),
      txn({ amountCents: -100, splits: [] }),
    ]) {
      expect(await createTransaction(prisma, alice.id, input)).toEqual({
        ok: false,
        reason: "invalid-amount",
      });
    }
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("matches category type to kind and keeps categories off transfers", async () => {
    const paycheck = await category(alice.id, "Paycheck");
    const groceries = await category(alice.id, "Groceries");
    expect(
      await createTransaction(
        prisma,
        alice.id,
        txn({ splits: [{ categoryId: paycheck, amountCents: -4_250 }] }),
      ),
    ).toEqual({ ok: false, reason: "category-type" });
    expect(
      await createTransaction(
        prisma,
        alice.id,
        txn({
          kind: "TRANSFER",
          splits: [{ categoryId: groceries, amountCents: -4_250 }],
        }),
      ),
    ).toEqual({ ok: false, reason: "category-type" });
    // Refunds use spending categories.
    expect(
      (
        await createTransaction(
          prisma,
          alice.id,
          txn({
            kind: "REFUND",
            amountCents: 500,
            splits: [{ categoryId: groceries, amountCents: 500 }],
          }),
        )
      ).ok,
    ).toBe(true);
  });
});

describe("editing", () => {
  it("replaces details and splits, and turning an expense into a transfer removes its category", async () => {
    const groceries = await category(alice.id, "Groceries");
    const id = await create(
      alice.id,
      txn({ splits: [{ categoryId: groceries, amountCents: -4_250 }] }),
    );
    expect(
      await updateTransaction(
        prisma,
        alice.id,
        id,
        txn({
          kind: "TRANSFER",
          amountCents: -6_000,
          description: "TEST MOVE TO SAVINGS",
          splits: [{ categoryId: null, amountCents: -6_000 }],
        }),
      ),
    ).toEqual({ ok: true, value: undefined });
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id },
      include: { splits: true },
    });
    expect(stored).toMatchObject({
      kind: "TRANSFER",
      amountCents: -6_000,
      categorySource: "NONE",
      description: "TEST MOVE TO SAVINGS",
    });
    expect(
      stored.splits.map((split) => [split.categoryId, split.amountCents]),
    ).toEqual([[null, -6_000]]);
  });

  it("keeps an archived category already on the transaction but refuses it for new ones", async () => {
    const groceries = await category(alice.id, "Groceries");
    const id = await create(
      alice.id,
      txn({ splits: [{ categoryId: groceries, amountCents: -4_250 }] }),
    );
    await setCategoryArchived(prisma, alice.id, groceries, true);
    expect(
      await updateTransaction(
        prisma,
        alice.id,
        id,
        txn({
          description: "Edited",
          splits: [{ categoryId: groceries, amountCents: -4_250 }],
        }),
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await createTransaction(
        prisma,
        alice.id,
        txn({ splits: [{ categoryId: groceries, amountCents: -4_250 }] }),
      ),
    ).toEqual({ ok: false, reason: "category-archived" });
  });

  it("does not edit or delete imported transactions or anything on an archived account", async () => {
    const imported = await prisma.transaction.create({
      data: {
        userId: alice.id,
        accountId: checking,
        date: toDatabaseDate(parseCalendarDate("2026-10-10")),
        amountCents: -700,
        description: "IMPORTED ROW",
        kind: "EXPENSE",
        externalId: "ext-1",
        fingerprint: "fp-imported",
        splits: { create: [{ amountCents: -700 }] },
      },
    });
    expect(
      await updateTransaction(prisma, alice.id, imported.id, txn()),
    ).toEqual({
      ok: false,
      reason: "imported",
    });
    expect(await deleteTransaction(prisma, alice.id, imported.id)).toEqual({
      ok: false,
      reason: "imported",
    });

    const id = await create(alice.id, txn());
    await prisma.financialAccount.update({
      where: { id: checking },
      data: { archivedAt: new Date() },
    });
    expect(await updateTransaction(prisma, alice.id, id, txn())).toEqual({
      ok: false,
      reason: "account-archived",
    });
    expect(await createTransaction(prisma, alice.id, txn())).toEqual({
      ok: false,
      reason: "account-archived",
    });
  });

  it("deletes a manual transaction with its splits", async () => {
    const id = await create(alice.id, txn());
    expect(await deleteTransaction(prisma, alice.id, id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await prisma.transactionSplit.count()).toBe(0);
  });
});

describe("balances stay separate from transactions", () => {
  it("never changes a balance snapshot when transactions are added, edited or deleted", async () => {
    const snapshot = await prisma.balanceSnapshot.create({
      data: {
        userId: alice.id,
        accountId: checking,
        asOfDate: toDatabaseDate(parseCalendarDate("2026-10-01")),
        balanceCents: 123_456,
        source: "MANUAL",
      },
    });
    const id = await create(
      alice.id,
      txn({ date: parseCalendarDate("2026-10-01") }),
    );
    await updateTransaction(
      prisma,
      alice.id,
      id,
      txn({
        amountCents: -99_999,
        splits: [{ categoryId: null, amountCents: -99_999 }],
      }),
    );
    await deleteTransaction(prisma, alice.id, id);
    expect(
      await prisma.balanceSnapshot.findMany({ where: { accountId: checking } }),
    ).toEqual([snapshot]);
  });
});

describe("another user's data behaves as if it does not exist", () => {
  it("refuses another user's account or category", async () => {
    await ensureStarterCategories(prisma, bob.id);
    const bobChecking = await account(bob.id, "CHECKING", "Bob checking");
    const aliceGroceries = await category(alice.id, "Groceries");

    expect(
      await createTransaction(prisma, bob.id, txn({ accountId: checking })),
    ).toEqual({
      ok: false,
      reason: "account-not-found",
    });
    expect(
      await createTransaction(
        prisma,
        bob.id,
        txn({
          accountId: bobChecking,
          splits: [{ categoryId: aliceGroceries, amountCents: -4_250 }],
        }),
      ),
    ).toEqual({ ok: false, reason: "category-not-found" });
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("cannot read, edit or delete another user's transaction, or its categories", async () => {
    const id = await create(alice.id, txn());
    expect(await getTransaction(prisma, bob.id, id)).toBeNull();
    expect(
      (await listTransactions(prisma, bob.id, { month: OCTOBER })).rows,
    ).toEqual([]);
    expect(
      (
        await listTransactions(prisma, bob.id, {
          month: OCTOBER,
          accountId: checking,
        })
      ).rows,
    ).toEqual([]);
    expect(
      await updateTransaction(
        prisma,
        bob.id,
        id,
        txn({ description: "Taken" }),
      ),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await deleteTransaction(prisma, bob.id, id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      (await prisma.transaction.findUniqueOrThrow({ where: { id } }))
        .description,
    ).toBe("TEST PURCHASE");

    const groceries = await category(alice.id, "Groceries");
    expect(
      await updateCategory(prisma, bob.id, groceries, {
        name: "Mine",
        isEssential: false,
      }),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await setCategoryArchived(prisma, bob.id, groceries, true)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      await createCategory(prisma, bob.id, {
        name: "Sneaky",
        type: "EXPENSE",
        parentId: await category(alice.id, "Food"),
        isEssential: false,
      }),
    ).toEqual({ ok: false, reason: "invalid-parent" });
  });
});
