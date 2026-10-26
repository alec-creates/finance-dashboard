import { describe, expect, it } from "vitest";

import { sumCents } from "./money";
import {
  categoryTypeForKind,
  countsAsIncome,
  countsAsSpending,
  directionOf,
  evenSplits,
  isAmountValidForKind,
  KIND_GROUPS,
  periodTotals,
  signedAmountCents,
  splitProblem,
  TXN_KINDS,
  unassignedCents,
} from "./transactions";

describe("classification", () => {
  it("counts only INCOME as income and only EXPENSE and REFUND as spending", () => {
    expect(TXN_KINDS.filter(countsAsIncome)).toEqual(["INCOME"]);
    expect(TXN_KINDS.filter(countsAsSpending)).toEqual(["EXPENSE", "REFUND"]);
  });

  it("puts every kind in exactly one form group", () => {
    const grouped = KIND_GROUPS.flatMap(({ kinds }) => [...kinds]);
    expect([...grouped].sort()).toEqual([...TXN_KINDS].sort());
  });

  it("categorizes refunds with spending categories and movements not at all", () => {
    expect(categoryTypeForKind("EXPENSE")).toBe("EXPENSE");
    expect(categoryTypeForKind("REFUND")).toBe("EXPENSE");
    expect(categoryTypeForKind("INCOME")).toBe("INCOME");
    for (const kind of [
      "TRANSFER",
      "CREDIT_CARD_PAYMENT",
      "INVESTMENT_CONTRIBUTION",
      "INVESTMENT_WITHDRAWAL",
      "ADJUSTMENT",
    ] as const) {
      expect(categoryTypeForKind(kind)).toBeNull();
    }
  });
});

describe("signedAmountCents", () => {
  it("makes expenses negative and income and refunds positive", () => {
    expect(signedAmountCents("EXPENSE", 4_250)).toBe(-4_250);
    expect(signedAmountCents("INCOME", 250_000)).toBe(250_000);
    expect(signedAmountCents("REFUND", 1_999)).toBe(1_999);
  });

  it("ignores a direction for kinds whose direction is fixed", () => {
    expect(signedAmountCents("EXPENSE", 100, "in")).toBe(-100);
    expect(signedAmountCents("INCOME", 100, "out")).toBe(100);
  });

  it("uses the chosen direction for movements: both legs of a card payment", () => {
    expect(signedAmountCents("CREDIT_CARD_PAYMENT", 42_000, "out")).toBe(
      -42_000,
    ); // checking
    expect(signedAmountCents("CREDIT_CARD_PAYMENT", 42_000, "in")).toBe(42_000); // card
    expect(() => signedAmountCents("TRANSFER", 100)).toThrow(RangeError);
  });

  it("rejects zero, negative and fractional magnitudes", () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() => signedAmountCents("EXPENSE", bad)).toThrow(RangeError);
    }
  });

  it("checks stored amounts against the kind", () => {
    expect(isAmountValidForKind("EXPENSE", -1)).toBe(true);
    expect(isAmountValidForKind("EXPENSE", 1)).toBe(false);
    expect(isAmountValidForKind("REFUND", -1)).toBe(false);
    expect(isAmountValidForKind("TRANSFER", -1)).toBe(true);
    expect(isAmountValidForKind("TRANSFER", 0)).toBe(false);
    expect(directionOf(-5)).toBe("out");
    expect(directionOf(5)).toBe("in");
  });
});

describe("periodTotals", () => {
  it("counts a card purchase as spending and the card payment not at all", () => {
    const month = [
      { kind: "INCOME", amountCents: 300_000 }, // paycheck into checking
      { kind: "EXPENSE", amountCents: -12_500 }, // purchase on the card
      { kind: "CREDIT_CARD_PAYMENT", amountCents: -12_500 }, // checking pays the card
      { kind: "CREDIT_CARD_PAYMENT", amountCents: 12_500 }, // the card receives it
    ] as const;
    expect(periodTotals(month)).toEqual({
      incomeCents: 300_000,
      spendingCents: 12_500,
      netCents: 287_500,
      excludedCount: 2,
    });
  });

  it("lets refunds reduce spending instead of adding income", () => {
    expect(
      periodTotals([
        { kind: "EXPENSE", amountCents: -8_000 },
        { kind: "REFUND", amountCents: 3_000 },
      ]),
    ).toMatchObject({ incomeCents: 0, spendingCents: 5_000, netCents: -5_000 });
  });

  it("can show net refunds when refunds exceed purchases in a period", () => {
    expect(
      periodTotals([{ kind: "REFUND", amountCents: 2_000 }]),
    ).toMatchObject({ spendingCents: -2_000, netCents: 2_000 });
  });

  it("ignores transfers, contributions, withdrawals and adjustments in either direction", () => {
    expect(
      periodTotals([
        { kind: "TRANSFER", amountCents: -50_000 },
        { kind: "TRANSFER", amountCents: 50_000 },
        { kind: "INVESTMENT_CONTRIBUTION", amountCents: -20_000 },
        { kind: "INVESTMENT_WITHDRAWAL", amountCents: 10_000 },
        { kind: "ADJUSTMENT", amountCents: 1 },
      ]),
    ).toEqual({
      incomeCents: 0,
      spendingCents: 0,
      netCents: 0,
      excludedCount: 5,
    });
  });

  it("returns zeros for an empty period", () => {
    expect(periodTotals([])).toEqual({
      incomeCents: 0,
      spendingCents: 0,
      netCents: 0,
      excludedCount: 0,
    });
  });
});

describe("splits", () => {
  it("divides evenly to the cent, remainder spread one cent at a time", () => {
    const parts = evenSplits(10_000, 3);
    expect(parts).toEqual([3_334, 3_333, 3_333]);
    expect(sumCents(parts)).toBe(10_000);
    expect(evenSplits(1, 3)).toEqual([1, 0, 0]);
  });

  it("reports what is left to assign", () => {
    expect(unassignedCents(10_000, [2_500, 2_500])).toBe(5_000);
    expect(unassignedCents(10_000, [6_000, 6_000])).toBe(-2_000);
  });

  it("accepts splits that sum exactly and rejects anything else", () => {
    expect(splitProblem(10_000, [3_334, 3_333, 3_333])).toBeNull();
    expect(splitProblem(10_000, [3_333, 3_333, 3_333])).toMatch(/less/);
    expect(splitProblem(10_000, [5_000, 5_001])).toMatch(/more/);
    expect(splitProblem(10_000, [])).toMatch(/at least one/);
    expect(splitProblem(10_000, [10_000, 0])).toMatch(/above zero/);
    expect(
      splitProblem(
        21,
        Array.from({ length: 21 }, () => 1),
      ),
    ).toMatch(/at most 20/);
  });
});
