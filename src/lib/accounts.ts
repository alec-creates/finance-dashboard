/**
 * Account types and balance conventions (docs/data-model.md, ADR-0007). Pure: no database, no framework.
 *
 * - Balances are signed cents. Amounts owed on credit cards, loans and other liabilities are stored NEGATIVE, so a
 *   net worth is a plain sum; a positive card balance is a credit (overpayment).
 * - Bank, card, loan and other accounts keep balance snapshots. Investment accounts keep portfolio valuations instead:
 *   holdings value plus cash, recorded as two parts of one total so the cash is never counted twice.
 * - A balance is a point-in-time fact, separate from transactions. Nothing here treats a positive balance as money
 *   that is available to spend; that is Safe to Spend's job, for the accounts the owner opts in.
 */
import { compareDates, todayInTimeZone, type CalendarDate } from "./dates";
import { addCents, negateCents, subtractCents, sumCents } from "./money";

export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "INVESTMENT",
  "CASH",
  "OTHER_ASSET",
  "LOAN",
  "OTHER_LIABILITY",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const INVESTMENT_ACCOUNT_TYPES = [
  "TAXABLE_BROKERAGE",
  "TRADITIONAL_IRA",
  "ROTH_IRA",
  "CRYPTO_EXCHANGE",
  "OTHER_INVESTMENT",
] as const;
export type InvestmentAccountType = (typeof INVESTMENT_ACCOUNT_TYPES)[number];

export const SNAPSHOT_SOURCES = [
  "PROVIDER",
  "STATEMENT",
  "MANUAL",
  "COMPUTED",
] as const;
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  INVESTMENT: "Investment",
  CASH: "Cash",
  OTHER_ASSET: "Other asset",
  LOAN: "Loan",
  OTHER_LIABILITY: "Other liability",
};

export const INVESTMENT_TYPE_LABELS: Record<InvestmentAccountType, string> = {
  TAXABLE_BROKERAGE: "Taxable brokerage",
  TRADITIONAL_IRA: "Traditional IRA",
  ROTH_IRA: "Roth IRA",
  CRYPTO_EXCHANGE: "Crypto exchange",
  OTHER_INVESTMENT: "Other investment",
};

export const SNAPSHOT_SOURCE_LABELS: Record<SnapshotSource, string> = {
  PROVIDER: "Synced",
  STATEMENT: "Statement",
  MANUAL: "Manual",
  COMPUTED: "Calculated",
};

const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set([
  "CREDIT_CARD",
  "LOAN",
  "OTHER_LIABILITY",
]);

/** Accounts whose balance can count toward Safe to Spend (mirrors a database CHECK constraint). */
const SPENDABLE_TYPES: ReadonlySet<AccountType> = new Set([
  "CHECKING",
  "SAVINGS",
  "CASH",
]);

export function isLiabilityType(type: AccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

export function supportsSafeToSpend(type: AccountType): boolean {
  return SPENDABLE_TYPES.has(type);
}

/** Where an account's balance history lives. */
export function balanceStorage(type: AccountType): "snapshot" | "valuation" {
  return type === "INVESTMENT" ? "valuation" : "snapshot";
}

export function accountTypeLabel(
  type: AccountType,
  investmentType?: InvestmentAccountType | null,
): string {
  return type === "INVESTMENT" && investmentType
    ? INVESTMENT_TYPE_LABELS[investmentType]
    : ACCOUNT_TYPE_LABELS[type];
}

// ---------------------------------------------------------------------------------------------------------------------
// Groups, in display order

export const ACCOUNT_GROUPS = [
  { id: "cash", label: "Cash", types: ["CHECKING", "SAVINGS", "CASH"] },
  { id: "credit", label: "Credit cards", types: ["CREDIT_CARD"] },
  { id: "investments", label: "Investments", types: ["INVESTMENT"] },
  { id: "otherAssets", label: "Other assets", types: ["OTHER_ASSET"] },
  {
    id: "loans",
    label: "Loans and other debts",
    types: ["LOAN", "OTHER_LIABILITY"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  types: readonly AccountType[];
}[];
export type AccountGroupId = (typeof ACCOUNT_GROUPS)[number]["id"];

export function accountGroupOf(type: AccountType): AccountGroupId {
  const group = ACCOUNT_GROUPS.find(({ types }) =>
    (types as readonly AccountType[]).includes(type),
  );
  if (!group) {
    throw new RangeError("Unknown account type");
  }
  return group.id;
}

// ---------------------------------------------------------------------------------------------------------------------
// Sign convention at the form boundary

/**
 * Converts what the owner types into the stored, signed balance. For liabilities the form asks for the amount owed
 * (positive), stored negative; a negative "owed" amount is a credit balance and is stored positive. Assets are stored
 * as entered (a checking account can be overdrawn).
 */
export function storedBalanceFromEntry(
  type: AccountType,
  enteredCents: number,
): number {
  return isLiabilityType(type) ? negateCents(enteredCents) : enteredCents;
}

/** The inverse of storedBalanceFromEntry: the number a form shows for an existing balance. */
export function entryFromStoredBalance(
  type: AccountType,
  storedCents: number,
): number {
  return isLiabilityType(type) ? negateCents(storedCents) : storedCents;
}

export type BalanceDescription =
  | { kind: "asset"; amountCents: number } // may be negative (overdrawn)
  | { kind: "owed"; amountCents: number } // positive magnitude owed
  | { kind: "credit"; amountCents: number } // liability with a credit balance, positive magnitude
  | { kind: "settled" }; // liability at exactly zero

/** How to present a stored balance: liabilities read as an amount owed, never as a negative asset. */
export function describeBalance(
  type: AccountType,
  storedCents: number,
): BalanceDescription {
  if (!isLiabilityType(type)) {
    return { kind: "asset", amountCents: storedCents };
  }
  if (storedCents < 0) {
    return { kind: "owed", amountCents: negateCents(storedCents) };
  }
  if (storedCents > 0) {
    return { kind: "credit", amountCents: storedCents };
  }
  return { kind: "settled" };
}

// ---------------------------------------------------------------------------------------------------------------------
// Current balance

/** On the same date, an institution-reported figure wins over the owner's entry, which wins over a calculation. */
const SOURCE_PRIORITY: Record<SnapshotSource, number> = {
  STATEMENT: 0,
  PROVIDER: 1,
  MANUAL: 2,
  COMPUTED: 3,
};

export interface DatedEntry {
  asOfDate: CalendarDate;
  source: SnapshotSource;
}

/** The entry that represents the account now: the latest date, then the most authoritative source on that date. */
export function latestEntry<T extends DatedEntry>(
  entries: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const entry of entries) {
    if (
      !best ||
      compareDates(entry.asOfDate, best.asOfDate) > 0 ||
      (entry.asOfDate === best.asOfDate &&
        SOURCE_PRIORITY[entry.source] < SOURCE_PRIORITY[best.source])
    ) {
      best = entry;
    }
  }
  return best;
}

/** An investment account's total: holdings at market value plus uninvested cash. */
export function valuationTotalCents(valuation: {
  marketValueCents: number;
  cashCents: number;
}): number {
  return addCents(valuation.marketValueCents, valuation.cashCents);
}

/**
 * Splits an entered investment total into the stored parts. The cash is part of the total, so holdings are the
 * remainder; entering the same cash again elsewhere would double-count it.
 */
export function splitValuation(
  totalCents: number,
  cashCents: number,
): { marketValueCents: number; cashCents: number } {
  if (totalCents < 0) {
    throw new RangeError("An account value cannot be negative");
  }
  if (cashCents < 0 || cashCents > totalCents) {
    throw new RangeError("Cash must be between zero and the total value");
  }
  return { marketValueCents: subtractCents(totalCents, cashCents), cashCents };
}

/** Sum of current balances; accounts without a balance yet are counted separately, never as zero. */
export function totalOfBalances(balances: readonly (number | null)[]): {
  totalCents: number;
  missing: number;
} {
  const known = balances.filter((value): value is number => value !== null);
  return {
    totalCents: sumCents(known),
    missing: balances.length - known.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Rules for edits

/**
 * Whether an account's type may change. Freely while it has no history; once balances or transactions exist, only
 * between checking, savings and cash, which share storage, sign and meaning. Anything else would reinterpret
 * recorded history (a card balance read as an asset, a valuation read as a bank balance, a Roth IRA as taxable).
 */
export function canChangeAccountType(
  from: { type: AccountType; investmentType: InvestmentAccountType | null },
  to: { type: AccountType; investmentType: InvestmentAccountType | null },
  hasHistory: boolean,
): boolean {
  if (from.type === to.type && from.investmentType === to.investmentType) {
    return true;
  }
  if (!hasHistory) {
    return true;
  }
  return supportsSafeToSpend(from.type) && supportsSafeToSpend(to.type);
}

/**
 * The latest as-of date anyone could mean: today in the earliest time zone on Earth (UTC+14). Later dates are
 * rejected; any date the owner sees as "today", wherever they are, is accepted.
 */
export function latestAllowedBalanceDate(now: Date = new Date()): CalendarDate {
  return todayInTimeZone("Pacific/Kiritimati", now);
}

export const EARLIEST_BALANCE_DATE = "1970-01-01" as CalendarDate;
