/**
 * Transaction kinds and cash-flow classification (ADR-0004). Pure: no database, no framework.
 *
 * - `amountCents` is signed from the owner's point of view: negative means the account has less money (a card
 *   purchase on a credit card is negative; paying the card is positive on the card and negative on checking).
 * - Reports select by KIND, never by category name. Income = INCOME. Spending = EXPENSE + REFUND (refunds reduce
 *   spending, they are not income). Transfers, card payments, investment contributions and withdrawals, and
 *   adjustments move money between the owner's own accounts or correct it, so they are left out of both; each leg of
 *   such a movement is excluded on its own, so recording both legs can never double count.
 * - Categories live on splits, which sum exactly to the transaction amount.
 */
import { negateCents, splitEvenly, subtractCents, sumCents } from "./money";

export const TXN_KINDS = [
  "EXPENSE",
  "INCOME",
  "REFUND",
  "TRANSFER",
  "CREDIT_CARD_PAYMENT",
  "INVESTMENT_CONTRIBUTION",
  "INVESTMENT_WITHDRAWAL",
  "ADJUSTMENT",
] as const;
export type TxnKind = (typeof TXN_KINDS)[number];

export type CategoryType = "EXPENSE" | "INCOME";
export type Direction = "in" | "out";

interface KindRule {
  label: string;
  description: string;
  /** Fixed for income, expenses and refunds; chosen by the owner for movements. */
  direction: Direction | "either";
  /** Which categories its splits may use; null means splits are never categorized. */
  categoryType: CategoryType | null;
}

export const KIND_RULES: Record<TxnKind, KindRule> = {
  EXPENSE: {
    label: "Expense",
    description: "A purchase or bill, including credit card purchases.",
    direction: "out",
    categoryType: "EXPENSE",
  },
  INCOME: {
    label: "Income",
    description: "Pay, interest or other money earned.",
    direction: "in",
    categoryType: "INCOME",
  },
  REFUND: {
    label: "Refund",
    description: "Money back for a purchase. Reduces spending.",
    direction: "in",
    categoryType: "EXPENSE",
  },
  TRANSFER: {
    label: "Transfer",
    description: "Between your own accounts. Not income or spending.",
    direction: "either",
    categoryType: null,
  },
  CREDIT_CARD_PAYMENT: {
    label: "Credit card payment",
    description:
      "Paying a card bill. The purchases already counted as spending.",
    direction: "either",
    categoryType: null,
  },
  INVESTMENT_CONTRIBUTION: {
    label: "Investment contribution",
    description: "Money moved into an investment account.",
    direction: "either",
    categoryType: null,
  },
  INVESTMENT_WITHDRAWAL: {
    label: "Investment withdrawal",
    description: "Money moved out of an investment account.",
    direction: "either",
    categoryType: null,
  },
  ADJUSTMENT: {
    label: "Adjustment",
    description: "A correction. Not income or spending.",
    direction: "either",
    categoryType: null,
  },
};

export const KIND_GROUPS = [
  { label: "Income and spending", kinds: ["EXPENSE", "INCOME", "REFUND"] },
  {
    label: "Moving money (not counted)",
    kinds: [
      "TRANSFER",
      "CREDIT_CARD_PAYMENT",
      "INVESTMENT_CONTRIBUTION",
      "INVESTMENT_WITHDRAWAL",
      "ADJUSTMENT",
    ],
  },
] as const satisfies readonly { label: string; kinds: readonly TxnKind[] }[];

export function categoryTypeForKind(kind: TxnKind): CategoryType | null {
  return KIND_RULES[kind].categoryType;
}

export function countsAsIncome(kind: TxnKind): boolean {
  return kind === "INCOME";
}

export function countsAsSpending(kind: TxnKind): boolean {
  return kind === "EXPENSE" || kind === "REFUND";
}

/**
 * The stored, signed amount for what the owner entered: a positive magnitude, plus a direction for movements.
 * Income and refunds are always money in; expenses always money out.
 */
export function signedAmountCents(
  kind: TxnKind,
  magnitudeCents: number,
  direction?: Direction,
): number {
  if (!Number.isSafeInteger(magnitudeCents) || magnitudeCents <= 0) {
    throw new RangeError("The amount must be a positive number of cents");
  }
  const fixed = KIND_RULES[kind].direction;
  const resolved = fixed === "either" ? direction : fixed;
  if (!resolved) {
    throw new RangeError("Choose whether money went in or out");
  }
  return resolved === "in" ? magnitudeCents : negateCents(magnitudeCents);
}

/** Whether a stored amount is consistent with its kind (income and refunds in, expenses out, nothing zero). */
export function isAmountValidForKind(
  kind: TxnKind,
  amountCents: number,
): boolean {
  if (!Number.isSafeInteger(amountCents) || amountCents === 0) {
    return false;
  }
  const fixed = KIND_RULES[kind].direction;
  return (
    fixed === "either" || (fixed === "in" ? amountCents > 0 : amountCents < 0)
  );
}

export function directionOf(amountCents: number): Direction {
  return amountCents < 0 ? "out" : "in";
}

// ---------------------------------------------------------------------------------------------------------------------
// Period totals

export interface PeriodTotals {
  /** Sum of INCOME. */
  incomeCents: number;
  /** Money spent: expenses minus refunds, as a positive number when more was spent than refunded. */
  spendingCents: number;
  /** Income minus spending. */
  netCents: number;
  /** Transfers, card payments, contributions, withdrawals and adjustments, left out of the totals above. */
  excludedCount: number;
}

export function periodTotals(
  transactions: readonly { kind: TxnKind; amountCents: number }[],
): PeriodTotals {
  const income = sumCents(
    transactions
      .filter(({ kind }) => countsAsIncome(kind))
      .map(({ amountCents }) => amountCents),
  );
  // Expenses are negative and refunds positive, so their sum is minus the net amount spent.
  const spending = negateCents(
    sumCents(
      transactions
        .filter(({ kind }) => countsAsSpending(kind))
        .map(({ amountCents }) => amountCents),
    ),
  );
  return {
    incomeCents: income,
    spendingCents: spending,
    netCents: subtractCents(income, spending),
    excludedCount: transactions.filter(
      ({ kind }) => !countsAsIncome(kind) && !countsAsSpending(kind),
    ).length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Splits (as positive magnitudes in the transaction's direction)

export const MAX_SPLITS = 20;

/** How much of the transaction is not yet assigned to a split (negative when the splits add up to too much). */
export function unassignedCents(
  totalMagnitudeCents: number,
  splitMagnitudesCents: readonly number[],
): number {
  return subtractCents(totalMagnitudeCents, sumCents(splitMagnitudesCents));
}

/** Divides an amount into `parts` splits that differ by at most one cent and sum exactly to it. */
export function evenSplits(
  totalMagnitudeCents: number,
  parts: number,
): number[] {
  return splitEvenly(totalMagnitudeCents, parts);
}

/** Problems with a set of split magnitudes, or null when they are valid. */
export function splitProblem(
  totalMagnitudeCents: number,
  splitMagnitudesCents: readonly number[],
): string | null {
  if (splitMagnitudesCents.length === 0) {
    return "Add at least one split";
  }
  if (splitMagnitudesCents.length > MAX_SPLITS) {
    return `Use at most ${MAX_SPLITS} splits`;
  }
  if (splitMagnitudesCents.some((cents) => cents <= 0)) {
    return "Each split needs an amount above zero";
  }
  const remaining = unassignedCents(totalMagnitudeCents, splitMagnitudesCents);
  if (remaining !== 0) {
    return remaining > 0
      ? "The splits add up to less than the amount"
      : "The splits add up to more than the amount";
  }
  return null;
}
