import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import type * as PrismaEnums from "@/generated/prisma/enums";
import {
  firstDayOfMonth,
  fromDatabaseDate,
  lastDayOfMonth,
  toDatabaseDate,
  type CalendarDate,
  type YearMonth,
} from "@/lib/dates";
import { sumCents } from "@/lib/money";
import type { TransactionInput } from "@/lib/transaction-forms";
import {
  categoryTypeForKind,
  isAmountValidForKind,
  periodTotals,
  type PeriodTotals,
  type TxnKind,
} from "@/lib/transactions";

/*
 * Cash transactions on bank and card accounts. Every query is scoped by the owner's id from the session; account and
 * category ids from a form are only used after confirming they belong to that owner (the database's composite foreign
 * keys refuse cross-user references as a second line of defence).
 *
 * Transactions never change balance snapshots: balances are separate, point-in-time facts (data-model.md).
 * Manual transactions are created here; imported ones (Task 9) keep their raw row and are not editable here apart
 * from deletion rules that will come with import undo.
 */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const kindsMatch: Same<TxnKind, PrismaEnums.TxnKind> = true;
void kindsMatch;

export type TransactionFailure =
  | "not-found"
  | "imported"
  | "account-not-found"
  | "account-archived"
  | "category-not-found"
  | "category-type"
  | "category-archived"
  | "invalid-amount";

export type TransactionResult<T = undefined> =
  { ok: true; value: T } | { ok: false; reason: TransactionFailure };

const ok = <T>(value: T): TransactionResult<T> => ({ ok: true, value });
const fail = (
  reason: TransactionFailure,
): { ok: false; reason: TransactionFailure } => ({ ok: false, reason });

export interface TransactionRow {
  id: string;
  date: CalendarDate;
  description: string;
  kind: TxnKind;
  amountCents: number;
  notes: string | null;
  /** Entered in this app (not imported), so it can be edited and deleted here. */
  manual: boolean;
  account: {
    id: string;
    name: string;
    type: PrismaEnums.AccountType;
    archived: boolean;
  };
  splits: {
    id: string;
    amountCents: number;
    category: {
      id: string;
      name: string;
      parentName: string | null;
      archived: boolean;
    } | null;
  }[];
}

const rowSelect = {
  id: true,
  date: true,
  description: true,
  kind: true,
  amountCents: true,
  notes: true,
  importBatchId: true,
  externalId: true,
  account: {
    select: { id: true, name: true, type: true, archivedAt: true },
  },
  splits: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountCents: true,
      category: {
        select: {
          id: true,
          name: true,
          archivedAt: true,
          parent: { select: { name: true } },
        },
      },
    },
  },
} as const;

type SelectedRow = {
  id: string;
  date: Date;
  description: string;
  kind: TxnKind;
  amountCents: number;
  notes: string | null;
  importBatchId: string | null;
  externalId: string | null;
  account: {
    id: string;
    name: string;
    type: PrismaEnums.AccountType;
    archivedAt: Date | null;
  };
  splits: {
    id: string;
    amountCents: number;
    category: {
      id: string;
      name: string;
      archivedAt: Date | null;
      parent: { name: string } | null;
    } | null;
  }[];
};

function toRow(row: SelectedRow): TransactionRow {
  return {
    id: row.id,
    date: fromDatabaseDate(row.date),
    description: row.description,
    kind: row.kind,
    amountCents: row.amountCents,
    notes: row.notes,
    manual: row.importBatchId === null && row.externalId === null,
    account: {
      id: row.account.id,
      name: row.account.name,
      type: row.account.type,
      archived: row.account.archivedAt !== null,
    },
    splits: row.splits.map((split) => ({
      id: split.id,
      amountCents: split.amountCents,
      category: split.category
        ? {
            id: split.category.id,
            name: split.category.name,
            parentName: split.category.parent?.name ?? null,
            archived: split.category.archivedAt !== null,
          }
        : null,
    })),
  };
}

/** A month of transactions, newest first, with totals classified by kind. */
export async function listTransactions(
  prisma: PrismaClient,
  userId: string,
  filter: { month: YearMonth; accountId?: string },
): Promise<{ rows: TransactionRow[]; totals: PeriodTotals }> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: toDatabaseDate(firstDayOfMonth(filter.month)),
        lte: toDatabaseDate(lastDayOfMonth(filter.month)),
      },
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
    },
    select: rowSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const result = rows.map(toRow);
  return { rows: result, totals: periodTotals(result) };
}

export async function getTransaction(
  prisma: PrismaClient,
  userId: string,
  transactionId: string,
): Promise<TransactionRow | null> {
  const row = await prisma.transaction.findUnique({
    where: { id_userId: { id: transactionId, userId } },
    select: rowSelect,
  });
  return row ? toRow(row) : null;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Checks everything the database cannot express: the sign matches the kind, splits are non-zero, share the
 * transaction's sign and sum exactly, and categories are the owner's, active and of the kind's type. Categories
 * already on the transaction being edited stay allowed even if archived since.
 */
async function validate(
  tx: Tx,
  userId: string,
  input: TransactionInput,
  allowedArchivedCategoryIds: ReadonlySet<string> = new Set(),
): Promise<TransactionFailure | null> {
  if (!isAmountValidForKind(input.kind, input.amountCents)) {
    return "invalid-amount";
  }
  const sameSign = (cents: number) =>
    cents !== 0 && Math.sign(cents) === Math.sign(input.amountCents);
  if (
    input.splits.length === 0 ||
    !input.splits.every((split) => sameSign(split.amountCents)) ||
    sumCents(input.splits.map((split) => split.amountCents)) !==
      input.amountCents
  ) {
    return "invalid-amount";
  }

  const account = await tx.financialAccount.findUnique({
    where: { id_userId: { id: input.accountId, userId } },
    select: { archivedAt: true },
  });
  if (!account) {
    return "account-not-found";
  }
  if (account.archivedAt) {
    return "account-archived";
  }

  const categoryIds = [
    ...new Set(
      input.splits.flatMap((split) =>
        split.categoryId ? [split.categoryId] : [],
      ),
    ),
  ];
  const expectedType = categoryTypeForKind(input.kind);
  if (categoryIds.length > 0 && expectedType === null) {
    return "category-type";
  }
  if (categoryIds.length > 0) {
    const categories = await tx.category.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { id: true, type: true, archivedAt: true },
    });
    if (categories.length !== categoryIds.length) {
      return "category-not-found";
    }
    if (categories.some((category) => category.type !== expectedType)) {
      return "category-type";
    }
    if (
      categories.some(
        (category) =>
          category.archivedAt && !allowedArchivedCategoryIds.has(category.id),
      )
    ) {
      return "category-archived";
    }
  }
  return null;
}

function categorySource(input: TransactionInput) {
  return input.splits.some((split) => split.categoryId) ? "MANUAL" : "NONE";
}

/** Records a manual transaction. It is confirmed (the owner entered it) and never deduplicated against imports. */
export async function createTransaction(
  prisma: PrismaClient,
  userId: string,
  input: TransactionInput,
): Promise<TransactionResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    const problem = await validate(tx, userId, input);
    if (problem) {
      return fail(problem);
    }
    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        date: toDatabaseDate(input.date),
        description: input.description,
        kind: input.kind,
        amountCents: input.amountCents,
        notes: input.notes,
        status: "POSTED",
        reviewStatus: "CONFIRMED",
        categorySource: categorySource(input),
        // Manual entries get their own key space so a later CSV import never silently treats them as the same row;
        // matching imports to manual entries is a reviewed reconciliation step (Task 9/10).
        fingerprint: `manual:${randomUUID()}`,
        splits: {
          // userId comes from the composite parent relation.
          create: input.splits.map((split) => ({
            categoryId: split.categoryId,
            amountCents: split.amountCents,
          })),
        },
      },
      select: { id: true },
    });
    return ok(created);
  });
}

/** Replaces a manual transaction's details and splits. Imported transactions can't be edited here. */
export async function updateTransaction(
  prisma: PrismaClient,
  userId: string,
  transactionId: string,
  input: TransactionInput,
): Promise<TransactionResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { id_userId: { id: transactionId, userId } },
      select: {
        importBatchId: true,
        externalId: true,
        account: { select: { archivedAt: true } },
        splits: { select: { categoryId: true } },
      },
    });
    if (!existing) {
      return fail("not-found");
    }
    if (existing.importBatchId !== null || existing.externalId !== null) {
      return fail("imported");
    }
    if (existing.account.archivedAt) {
      return fail("account-archived");
    }
    const keep = new Set(
      existing.splits.flatMap((split) =>
        split.categoryId ? [split.categoryId] : [],
      ),
    );
    const problem = await validate(tx, userId, input, keep);
    if (problem) {
      return fail(problem);
    }
    // Splits are replaced inside this database transaction; the deferred trigger checks the sum at commit.
    await tx.transactionSplit.deleteMany({ where: { transactionId, userId } });
    await tx.transaction.update({
      where: { id_userId: { id: transactionId, userId } },
      data: {
        accountId: input.accountId,
        date: toDatabaseDate(input.date),
        description: input.description,
        kind: input.kind,
        amountCents: input.amountCents,
        notes: input.notes,
        categorySource: categorySource(input),
        reviewStatus: "CONFIRMED",
        splits: {
          create: input.splits.map((split) => ({
            categoryId: split.categoryId,
            amountCents: split.amountCents,
          })),
        },
      },
    });
    return ok(undefined);
  });
}

/** Deletes a manual transaction (and its splits). Imported transactions are removed only by undoing their import. */
export async function deleteTransaction(
  prisma: PrismaClient,
  userId: string,
  transactionId: string,
): Promise<TransactionResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { id_userId: { id: transactionId, userId } },
      select: {
        importBatchId: true,
        externalId: true,
        account: { select: { archivedAt: true } },
      },
    });
    if (!existing) {
      return fail("not-found");
    }
    if (existing.importBatchId !== null || existing.externalId !== null) {
      return fail("imported");
    }
    if (existing.account.archivedAt) {
      return fail("account-archived");
    }
    await tx.transaction.delete({
      where: { id_userId: { id: transactionId, userId } },
    });
    return ok(undefined);
  });
}

/** The owner's time zone for "this month", or UTC until one is configured. */
export async function getUserTimeZone(
  prisma: PrismaClient,
  userId: string,
): Promise<string> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return settings?.timeZone ?? "UTC";
}
