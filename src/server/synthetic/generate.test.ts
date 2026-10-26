import { describe, expect, it } from "vitest";

import { fromDatabaseDate, parseCalendarDate, yearMonthOf } from "@/lib/dates";
import { toDecimal } from "@/lib/decimal";
import { sumCents } from "@/lib/money";

import { generateSyntheticDataset, type SyntheticDataset } from "./generate";
import { createRandom } from "./random";

const options = {
  userId: "synthetic-user-a",
  email: "demo@example.com",
  endDate: parseCalendarDate("2026-09-30"),
};
const data = generateSyntheticDataset(options);

const dateOf = (value: unknown) => fromDatabaseDate(value as Date);
const byId = <T extends { id?: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]));

describe("createRandom", () => {
  it("is deterministic and stays in range", () => {
    const a = createRandom(7);
    const b = createRandom(7);
    const values = Array.from({ length: 100 }, () => a.int(1, 6));
    expect(values).toEqual(Array.from({ length: 100 }, () => b.int(1, 6)));
    expect(values.every((value) => value >= 1 && value <= 6)).toBe(true);
    expect(() => a.pick([])).toThrow(RangeError);
  });
});

describe("generateSyntheticDataset", () => {
  it("is deterministic for the same options and changes with the seed", () => {
    expect(JSON.stringify(generateSyntheticDataset(options))).toBe(
      JSON.stringify(data),
    );
    expect(
      JSON.stringify(generateSyntheticDataset({ ...options, seed: 1 })),
    ).not.toBe(JSON.stringify(data));
  });

  it("covers 18 calendar months with a realistic volume of records", () => {
    const months = new Set(
      data.transactions.map((txn) => yearMonthOf(dateOf(txn.date))),
    );
    expect(months.size).toBe(18);
    expect(data.transactions.length).toBeGreaterThan(600); // roughly 35-40 a month
    expect(data.investmentTransactions.length).toBeGreaterThan(150);
    expect(data.prices.length).toBeGreaterThan(2_000);
  });

  it("uses unique ids owned by the one user", () => {
    for (const rows of Object.values(data).filter(Array.isArray) as {
      id?: string;
      userId?: string;
    }[][]) {
      const ids = rows.map((row) => row.id).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      for (const row of rows) {
        if ("userId" in row) {
          expect(row.userId).toBe(options.userId);
        }
      }
    }
  });

  it("gives every transaction splits that sum exactly to its amount", () => {
    const splitsByTxn = new Map<string, number[]>();
    for (const split of data.splits) {
      splitsByTxn.set(split.transactionId, [
        ...(splitsByTxn.get(split.transactionId) ?? []),
        split.amountCents,
      ]);
    }
    for (const txn of data.transactions) {
      const splits = splitsByTxn.get(txn.id ?? "") ?? [];
      expect(splits.length).toBeGreaterThan(0);
      expect(sumCents(splits)).toBe(txn.amountCents);
    }
    expect(data.splits.length).toBeGreaterThan(data.transactions.length); // some purchases are split
  });

  it("only categorizes income, expenses and refunds", () => {
    const transactions = byId(data.transactions);
    for (const split of data.splits) {
      const kind = transactions.get(split.transactionId)?.kind;
      if (split.categoryId) {
        expect(["INCOME", "EXPENSE", "REFUND"]).toContain(kind);
      }
    }
    expect(
      data.transactions.some((txn) => txn.reviewStatus === "NEEDS_REVIEW"),
    ).toBe(true);
  });

  it("follows the sign convention", () => {
    for (const txn of data.transactions) {
      if (txn.kind === "INCOME" || txn.kind === "REFUND") {
        expect(txn.amountCents).toBeGreaterThan(0);
      }
      if (txn.kind === "EXPENSE" || txn.kind === "INVESTMENT_CONTRIBUTION") {
        expect(txn.amountCents).toBeLessThan(0);
      }
    }
  });

  it("balances both legs of every transfer and card payment", () => {
    const legs = new Map<string, number[]>();
    for (const txn of data.transactions) {
      if (txn.transferPairId && txn.kind !== "INVESTMENT_CONTRIBUTION") {
        legs.set(txn.transferPairId, [
          ...(legs.get(txn.transferPairId) ?? []),
          txn.amountCents,
        ]);
      }
    }
    expect(legs.size).toBeGreaterThan(30);
    for (const amounts of legs.values()) {
      expect(amounts).toHaveLength(2);
      expect(sumCents(amounts)).toBe(0);
    }
  });

  it("matches every investment deposit to an equal and opposite checking leg", () => {
    const transactions = byId(data.transactions);
    const deposits = data.investmentTransactions.filter(
      (txn) => txn.type === "DEPOSIT",
    );
    // Weekly 15%-of-income contributions only move money in paycheck weeks (biweekly pay), into two accounts,
    // plus a monthly Roth IRA deposit.
    expect(deposits.length).toBeGreaterThan(80);
    for (const deposit of deposits) {
      const cashLeg = transactions.get(deposit.linkedCashTransactionId ?? "");
      expect(cashLeg?.kind).toBe("INVESTMENT_CONTRIBUTION");
      expect(cashLeg?.amountCents).toBe(-(deposit.cashAmountCents ?? 0));
    }
  });

  it("includes months with three biweekly paychecks", () => {
    const paychecksPerMonth = new Map<string, number>();
    for (const txn of data.transactions.filter(
      (t) => t.kind === "INCOME" && t.incomeSourceId,
    )) {
      const month = yearMonthOf(dateOf(txn.date));
      paychecksPerMonth.set(month, (paychecksPerMonth.get(month) ?? 0) + 1);
    }
    expect([...paychecksPerMonth.values()].some((count) => count === 3)).toBe(
      true,
    );
  });

  it("never overdraws cash accounts or investment cash", () => {
    const accounts = byId(data.accounts);
    for (const snapshot of data.balanceSnapshots) {
      const type = accounts.get(snapshot.accountId)?.type;
      if (type === "CHECKING" || type === "SAVINGS") {
        expect(snapshot.balanceCents).toBeGreaterThanOrEqual(0);
      }
    }
    for (const valuation of data.portfolioValuations) {
      expect(valuation.cashCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("records planned-vs-actual differences: one skipped and one missed contribution", () => {
    expect(data.contributionOverrides).toHaveLength(1);
    const weeklyPlanId = data.contributionPlans.find(
      (plan) => plan.ruleType === "PERCENT_OF_INCOME",
    )?.id;
    const skipped = dateOf(data.contributionOverrides[0]?.scheduledDate);
    const contributionDates = new Set(
      data.transactions
        .filter((txn) => txn.contributionPlanId === weeklyPlanId)
        .map((txn) => dateOf(txn.date)),
    );
    expect(contributionDates.has(skipped)).toBe(false);
  });

  it("keeps goal allocations within the savings balance", () => {
    const savingsId = data.accounts.find(
      (account) => account.type === "SAVINGS",
    )?.id;
    for (const snapshot of data.balanceSnapshots.filter(
      (s) => s.accountId === savingsId,
    )) {
      const asOf = dateOf(snapshot.asOfDate);
      const allocated = sumCents(
        data.goalLedgerEntries
          .filter((entry) => dateOf(entry.date) <= asOf)
          .map((entry) => entry.amountCents),
      );
      expect(allocated).toBeLessThanOrEqual(snapshot.balanceCents);
    }
  });

  it("values holdings exactly and records a USD value wherever no cash moves", () => {
    for (const holding of data.holdingSnapshots) {
      expect(toDecimal(String(holding.quantity)).greaterThan(0)).toBe(true);
    }
    for (const txn of data.investmentTransactions) {
      if (
        txn.type === "STAKING_REWARD" ||
        (txn.groupRef && txn.cashAmountCents === 0)
      ) {
        expect(txn.usdValueCents).toBeGreaterThan(0);
      }
    }
    expect(data.investmentTransactions.some((txn) => txn.groupRef)).toBe(true);
  });

  it("budgets only leaf or childless categories, so nothing is counted twice", () => {
    const parentIds = new Set(
      data.categories.map((category) => category.parentId).filter(Boolean),
    );
    for (const budget of data.budgets) {
      expect(parentIds.has(budget.categoryId)).toBe(false);
    }
  });

  it("contains no real-looking personal identifiers", () => {
    const text = JSON.stringify(data satisfies SyntheticDataset);
    expect(text).not.toMatch(/@(?!example\.com)[a-z0-9-]+\.[a-z]+/i);
    expect(
      data.accounts.every((account) =>
        /^Example /.test(account.institutionName ?? ""),
      ),
    ).toBe(true);
  });
});
