import type { PrismaClient } from "@/generated/prisma/client";
import type * as PrismaEnums from "@/generated/prisma/enums";
import type { AccountInput, BalanceInput } from "@/lib/account-forms";
import {
  balanceStorage,
  canChangeAccountType,
  latestEntry,
  valuationTotalCents,
  type AccountType,
  type InvestmentAccountType,
  type SnapshotSource,
} from "@/lib/accounts";
import {
  fromDatabaseDate,
  toDatabaseDate,
  type CalendarDate,
} from "@/lib/dates";

/*
 * Financial accounts and their balance history. Every function takes the owner's id from the authenticated session and
 * scopes every query by it: an id belonging to someone else behaves exactly like an id that does not exist.
 *
 * Balances are facts at a date, kept apart from transactions. Bank, card, loan and other accounts use BalanceSnapshot;
 * investment accounts use PortfolioValuation (holdings value + cash), never both, so nothing is counted twice.
 * Archived accounts keep all history; current totals and Safe to Spend leave them out.
 */

// The app's string unions and Prisma's generated enums must stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const enumsMatch: [
  Same<AccountType, PrismaEnums.AccountType>,
  Same<InvestmentAccountType, PrismaEnums.InvestmentAccountType>,
  Same<SnapshotSource, PrismaEnums.SnapshotSource>,
] = [true, true, true];
void enumsMatch;

export type AccountFailure =
  "not-found" | "archived" | "type-locked" | "has-history";

export type ServiceResult<T = undefined> =
  { ok: true; value: T } | { ok: false; reason: AccountFailure };

const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const fail = (
  reason: AccountFailure,
): { ok: false; reason: AccountFailure } => ({
  ok: false,
  reason,
});

export type CurrentBalance =
  | {
      storage: "snapshot";
      asOfDate: CalendarDate;
      source: SnapshotSource;
      balanceCents: number;
      availableCents: number | null;
    }
  | {
      storage: "valuation";
      asOfDate: CalendarDate;
      source: SnapshotSource;
      totalCents: number;
      marketValueCents: number;
      cashCents: number;
    };

/** The signed amount a current balance contributes to totals (cards and loans negative). */
export function currentAmountCents(balance: CurrentBalance): number {
  return balance.storage === "snapshot"
    ? balance.balanceCents
    : balance.totalCents;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  investmentType: InvestmentAccountType | null;
  institutionName: string | null;
  mask: string | null;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  minimumBalanceCents: number | null;
  archivedAt: Date | null;
  current: CurrentBalance | null;
}

const accountFields = {
  id: true,
  name: true,
  type: true,
  investmentType: true,
  institutionName: true,
  mask: true,
  includeInNetWorth: true,
  includeInSafeToSpend: true,
  minimumBalanceCents: true,
  archivedAt: true,
} as const;

/** Every relation that records history for an account. Any of them makes the account undeletable. */
const historyCounts = {
  balanceSnapshots: true,
  portfolioValuations: true,
  transactions: true,
  importBatches: true,
  categorizationRules: true,
  investmentTransactions: true,
  holdingSnapshots: true,
  incomeSources: true,
  contributionPlans: true,
  contributionAllocations: true,
  recurringSeries: true,
  savingsGoals: true,
  goalLedgerEntries: true,
} as const;

function hasAnyHistory(counts: Record<string, number>): boolean {
  return Object.values(counts).some((count) => count > 0);
}

interface SnapshotRow {
  id: string;
  accountId: string;
  asOfDate: Date;
  source: SnapshotSource;
  balanceCents: number;
  availableCents: number | null;
}

interface ValuationRow {
  id: string;
  accountId: string;
  asOfDate: Date;
  source: SnapshotSource;
  marketValueCents: number;
  cashCents: number;
}

function snapshotBalance(row: SnapshotRow): CurrentBalance {
  return {
    storage: "snapshot",
    asOfDate: fromDatabaseDate(row.asOfDate),
    source: row.source,
    balanceCents: row.balanceCents,
    availableCents: row.availableCents,
  };
}

function valuationBalance(row: ValuationRow): CurrentBalance {
  return {
    storage: "valuation",
    asOfDate: fromDatabaseDate(row.asOfDate),
    source: row.source,
    totalCents: valuationTotalCents(row),
    marketValueCents: row.marketValueCents,
    cashCents: row.cashCents,
  };
}

/** Picks the current entry among rows already narrowed to each account's latest dates. */
function currentByAccount<
  Row extends { accountId: string; asOfDate: Date; source: SnapshotSource },
>(
  rows: readonly Row[],
  toBalance: (row: Row) => CurrentBalance,
): Map<string, CurrentBalance> {
  const byAccount = new Map<string, Row[]>();
  for (const row of rows) {
    byAccount.set(row.accountId, [
      ...(byAccount.get(row.accountId) ?? []),
      row,
    ]);
  }
  const result = new Map<string, CurrentBalance>();
  for (const [accountId, accountRows] of byAccount) {
    const best = latestEntry(
      accountRows.map((row) => ({
        row,
        asOfDate: fromDatabaseDate(row.asOfDate),
        source: row.source,
      })),
    );
    if (best) {
      result.set(accountId, toBalance(best.row));
    }
  }
  return result;
}

/**
 * The owner's accounts (open and archived) with their current balances. Reads only the latest row per account and
 * source, so the cost does not grow with history.
 */
export async function listAccountsWithBalances(
  prisma: PrismaClient,
  userId: string,
): Promise<AccountSummary[]> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId },
    select: accountFields,
    orderBy: [{ name: "asc" }],
  });
  if (accounts.length === 0) {
    return [];
  }

  const [snapshotLatest, valuationLatest] = await Promise.all([
    prisma.balanceSnapshot.groupBy({
      by: ["accountId", "source"],
      where: { userId },
      _max: { asOfDate: true },
    }),
    prisma.portfolioValuation.groupBy({
      by: ["accountId", "source"],
      where: { userId },
      _max: { asOfDate: true },
    }),
  ]);
  const latestKeys = <
    T extends {
      accountId: string;
      source: SnapshotSource;
      _max: { asOfDate: Date | null };
    },
  >(
    groups: T[],
  ) =>
    groups.flatMap(({ accountId, source, _max }) =>
      _max.asOfDate ? [{ accountId, source, asOfDate: _max.asOfDate }] : [],
    );
  const snapshotKeys = latestKeys(snapshotLatest);
  const valuationKeys = latestKeys(valuationLatest);

  const [snapshots, valuations] = await Promise.all([
    snapshotKeys.length === 0
      ? []
      : prisma.balanceSnapshot.findMany({
          where: { userId, OR: snapshotKeys },
          select: {
            id: true,
            accountId: true,
            asOfDate: true,
            source: true,
            balanceCents: true,
            availableCents: true,
          },
        }),
    valuationKeys.length === 0
      ? []
      : prisma.portfolioValuation.findMany({
          where: { userId, OR: valuationKeys },
          select: {
            id: true,
            accountId: true,
            asOfDate: true,
            source: true,
            marketValueCents: true,
            cashCents: true,
          },
        }),
  ]);
  const currentSnapshots = currentByAccount(snapshots, snapshotBalance);
  const currentValuations = currentByAccount(valuations, valuationBalance);

  return accounts.map((account) => ({
    ...account,
    current:
      (balanceStorage(account.type) === "valuation"
        ? currentValuations.get(account.id)
        : currentSnapshots.get(account.id)) ?? null,
  }));
}

export interface BalanceHistoryEntry {
  id: string;
  asOfDate: CalendarDate;
  source: SnapshotSource;
  /** Signed balance, or the investment total. */
  amountCents: number;
  availableCents: number | null;
  cashCents: number | null;
}

export interface AccountDetail extends AccountSummary {
  hasHistory: boolean;
  history: BalanceHistoryEntry[];
  historyTotal: number;
}

const HISTORY_PAGE_SIZE = 60;

/** One account with its current balance and recent balance history, or null if the owner has no such account. */
export async function getAccountDetail(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
): Promise<AccountDetail | null> {
  const account = await prisma.financialAccount.findUnique({
    where: { id_userId: { id: accountId, userId } },
    select: { ...accountFields, _count: { select: historyCounts } },
  });
  if (!account) {
    return null;
  }
  const { _count, ...fields } = account;
  const where = { userId, accountId };
  const orderBy = [
    { asOfDate: "desc" as const },
    { createdAt: "desc" as const },
  ];

  let history: BalanceHistoryEntry[];
  let current: CurrentBalance | null;
  if (balanceStorage(account.type) === "valuation") {
    const rows = await prisma.portfolioValuation.findMany({
      where,
      orderBy,
      take: HISTORY_PAGE_SIZE,
    });
    history = rows.map((row) => ({
      id: row.id,
      asOfDate: fromDatabaseDate(row.asOfDate),
      source: row.source,
      amountCents: valuationTotalCents(row),
      availableCents: null,
      cashCents: row.cashCents,
    }));
    // The page holds every entry of the latest date (at most one per source), so the current entry is in it.
    current = currentByAccount(rows, valuationBalance).get(account.id) ?? null;
  } else {
    const rows = await prisma.balanceSnapshot.findMany({
      where,
      orderBy,
      take: HISTORY_PAGE_SIZE,
    });
    history = rows.map((row) => ({
      id: row.id,
      asOfDate: fromDatabaseDate(row.asOfDate),
      source: row.source,
      amountCents: row.balanceCents,
      availableCents: row.availableCents,
      cashCents: null,
    }));
    current = currentByAccount(rows, snapshotBalance).get(account.id) ?? null;
  }

  return {
    ...fields,
    current,
    hasHistory: hasAnyHistory(_count),
    history,
    historyTotal:
      balanceStorage(account.type) === "valuation"
        ? _count.portfolioValuations
        : _count.balanceSnapshots,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Changes

export async function createAccount(
  prisma: PrismaClient,
  userId: string,
  input: AccountInput,
): Promise<ServiceResult<{ id: string }>> {
  const account = await prisma.financialAccount.create({
    data: { ...input, userId },
    select: { id: true },
  });
  return ok(account);
}

export async function updateAccount(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  input: AccountInput,
): Promise<ServiceResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialAccount.findUnique({
      where: { id_userId: { id: accountId, userId } },
      select: {
        type: true,
        investmentType: true,
        archivedAt: true,
        _count: { select: historyCounts },
      },
    });
    if (!existing) {
      return fail("not-found");
    }
    if (existing.archivedAt) {
      return fail("archived");
    }
    if (
      !canChangeAccountType(existing, input, hasAnyHistory(existing._count))
    ) {
      return fail("type-locked");
    }
    await tx.financialAccount.update({
      where: { id_userId: { id: accountId, userId } },
      data: input,
    });
    return ok(undefined);
  });
}

export async function setAccountArchived(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  archived: boolean,
): Promise<ServiceResult> {
  const { count } = await prisma.financialAccount.updateMany({
    where: { id: accountId, userId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return count === 1 ? ok(undefined) : fail("not-found");
}

/** Deletes an account only if nothing was ever recorded for it (one added by mistake). Otherwise archive it. */
export async function deleteAccount(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
): Promise<ServiceResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialAccount.findUnique({
      where: { id_userId: { id: accountId, userId } },
      select: { _count: { select: historyCounts } },
    });
    if (!existing) {
      return fail("not-found");
    }
    if (hasAnyHistory(existing._count)) {
      return fail("has-history");
    }
    // The NO ACTION foreign keys still refuse if history appeared after the check.
    await tx.financialAccount.delete({
      where: { id_userId: { id: accountId, userId } },
    });
    return ok(undefined);
  });
}

/** A manual entry already exists for the date; carries its amount so the owner can decide. */
export interface ExistingManualEntry {
  ok: false;
  reason: "exists";
  /** Signed balance, or the investment total. */
  existingCents: number;
}

/**
 * Records the owner's balance for a date. If a manual entry already exists for that date, it is replaced only when
 * `replaceExisting` is set; otherwise nothing changes and the existing amount is returned, so the replacement is
 * always a deliberate choice. Statement, synced and calculated entries are separate rows and are never touched.
 */
export async function recordBalance(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  input: BalanceInput,
  options: { replaceExisting?: boolean } = {},
): Promise<ServiceResult<{ replaced: boolean }> | ExistingManualEntry> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({
      where: { id_userId: { id: accountId, userId } },
      select: { type: true, archivedAt: true },
    });
    if (!account) {
      return fail("not-found");
    }
    if (account.archivedAt) {
      return fail("archived");
    }
    if (balanceStorage(account.type) !== input.storage) {
      throw new Error("Balance input does not match the account type");
    }
    const asOfDate = toDatabaseDate(input.asOfDate);
    const key = { accountId, asOfDate, source: "MANUAL" as const };
    const exists = (existingCents: number): ExistingManualEntry => ({
      ok: false,
      reason: "exists",
      existingCents,
    });

    if (input.storage === "snapshot") {
      const data = {
        balanceCents: input.balanceCents,
        availableCents: input.availableCents,
      };
      const existing = await tx.balanceSnapshot.findUnique({
        where: { accountId_asOfDate_source: key },
        select: { balanceCents: true },
      });
      if (existing && !options.replaceExisting) {
        return exists(existing.balanceCents);
      }
      await tx.balanceSnapshot.upsert({
        where: { accountId_asOfDate_source: key },
        create: { ...key, userId, ...data },
        update: data,
      });
      return ok({ replaced: existing !== null });
    }

    const data = {
      marketValueCents: input.marketValueCents,
      cashCents: input.cashCents,
    };
    const existing = await tx.portfolioValuation.findUnique({
      where: { accountId_asOfDate_source: key },
      select: { marketValueCents: true, cashCents: true },
    });
    if (existing && !options.replaceExisting) {
      return exists(valuationTotalCents(existing));
    }
    await tx.portfolioValuation.upsert({
      where: { accountId_asOfDate_source: key },
      create: { ...key, userId, ...data },
      update: data,
    });
    return ok({ replaced: existing !== null });
  });
}

/** Removes one manual balance entry (a typo). Statement, synced and calculated entries cannot be removed here. */
export async function deleteManualBalance(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  entryId: string,
): Promise<ServiceResult> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({
      where: { id_userId: { id: accountId, userId } },
      select: { type: true, archivedAt: true },
    });
    if (!account) {
      return fail("not-found");
    }
    if (account.archivedAt) {
      return fail("archived");
    }
    const where = { id: entryId, userId, accountId, source: "MANUAL" as const };
    const { count } =
      balanceStorage(account.type) === "valuation"
        ? await tx.portfolioValuation.deleteMany({ where })
        : await tx.balanceSnapshot.deleteMany({ where });
    return count === 1 ? ok(undefined) : fail("not-found");
  });
}

/** Open accounts only, for API consumers that just need names. */
export async function listAccounts(prisma: PrismaClient, userId: string) {
  return prisma.financialAccount.findMany({
    where: { userId, archivedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      investmentType: true,
      institutionName: true,
      mask: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

/** The account's type, which decides how a balance form is read; null if the owner has no such account. */
export async function getAccountType(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
): Promise<AccountType | null> {
  const account = await prisma.financialAccount.findUnique({
    where: { id_userId: { id: accountId, userId } },
    select: { type: true },
  });
  return account?.type ?? null;
}
