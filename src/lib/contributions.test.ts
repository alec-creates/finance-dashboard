import { describe, expect, it } from "vitest";

import {
  contributionTargetCents,
  planContributions,
  splitContribution,
  sumInPeriod,
  type DatedAmount,
} from "./contributions";
import { parseCalendarDate } from "./dates";
import { sumCents } from "./money";
import type { Schedule } from "./schedules";

const d = parseCalendarDate;

// Synthetic biweekly take-home pay on Fridays (2026-01-02 is a Friday). All amounts are invented.
const paychecks: DatedAmount[] = [
  { date: d("2026-01-02"), amountCents: 187_500 },
  { date: d("2026-01-16"), amountCents: 187_500 },
  { date: d("2026-01-30"), amountCents: 187_500 },
];
const fifteenPercentOfIncome = {
  type: "percentOfIncome",
  percent: "0.15",
} as const;
const weeklyFridays: Schedule = {
  frequency: "weekly",
  anchorDate: d("2026-01-02"),
};

describe("contributionTargetCents", () => {
  it("uses fixed amounts as-is", () => {
    expect(
      contributionTargetCents({ type: "fixedAmount", amountCents: 5000 }),
    ).toBe(5000);
    expect(() =>
      contributionTargetCents({ type: "fixedAmount", amountCents: -1 }),
    ).toThrow(RangeError);
  });

  it("takes a percentage of the paycheck, rounding half-even once", () => {
    const rule = { type: "percentOfPaycheck", percent: "0.15" } as const;
    expect(contributionTargetCents(rule, 187_500)).toBe(28_125);
    expect(contributionTargetCents(rule, 187_533)).toBe(28_130); // 28129.95
    expect(contributionTargetCents(rule, 187_510)).toBe(28_126); // 28126.5 -> even
  });

  it("applies the minimum", () => {
    const rule = {
      type: "percentOfPaycheck",
      percent: "0.15",
      minimumCents: 30_000,
    } as const;
    expect(contributionTargetCents(rule, 187_500)).toBe(30_000);
    expect(contributionTargetCents(rule, 250_000)).toBe(37_500);
  });

  it("treats a negative basis as zero income", () => {
    expect(contributionTargetCents(fifteenPercentOfIncome, -5000)).toBe(0);
  });

  it("rejects missing income, out-of-range percentages and float percentages", () => {
    expect(() => contributionTargetCents(fifteenPercentOfIncome)).toThrow(
      RangeError,
    );
    expect(() =>
      contributionTargetCents(
        { type: "percentOfIncome", percent: "1.5" },
        1000,
      ),
    ).toThrow(RangeError);
    expect(() =>
      contributionTargetCents({ type: "percentOfIncome", percent: 0.15 }, 1000),
    ).toThrow(TypeError);
  });
});

describe("splitContribution", () => {
  const allocations = [
    { accountId: "brokerage", share: "0.7" },
    { accountId: "crypto", share: "0.3" },
  ];

  it("splits by share and keeps the total exact", () => {
    expect(splitContribution(28_000, allocations)).toEqual([
      { accountId: "brokerage", amountCents: 19_600 },
      { accountId: "crypto", amountCents: 8_400 },
    ]);
    // 19687.5 / 8437.5: the tied extra cent goes to the larger share
    const odd = splitContribution(28_125, allocations);
    expect(odd.map((part) => part.amountCents)).toEqual([19_688, 8_437]);
    expect(sumCents(odd.map((part) => part.amountCents))).toBe(28_125);
  });

  it("rejects shares that do not add up to 100%", () => {
    expect(() =>
      splitContribution(1000, [
        { accountId: "a", share: "0.7" },
        { accountId: "b", share: "0.4" },
      ]),
    ).toThrow(RangeError);
  });
});

describe("sumInPeriod", () => {
  it("excludes the start date and includes the end date", () => {
    expect(sumInPeriod(paychecks, d("2026-01-02"), d("2026-01-16"))).toBe(
      187_500,
    );
    expect(sumInPeriod(paychecks, d("2026-01-01"), d("2026-01-16"))).toBe(
      375_000,
    );
    expect(sumInPeriod(paychecks, null, d("2026-01-31"))).toBe(562_500);
  });
});

describe("planContributions", () => {
  it("plans weekly contributions from biweekly pay as a percentage of income", () => {
    const plan = planContributions({
      rule: fifteenPercentOfIncome,
      schedule: weeklyFridays,
      incomes: paychecks,
      from: d("2026-01-01"),
      to: d("2026-01-31"),
    });
    expect(plan.map(({ date, targetCents }) => [date, targetCents])).toEqual([
      ["2026-01-02", 28_125],
      ["2026-01-09", 0],
      ["2026-01-16", 28_125],
      ["2026-01-23", 0],
      ["2026-01-30", 28_125],
    ]);
    expect(sumCents(plan.map((entry) => entry.targetCents))).toBe(84_375); // 15% of $5,625
  });

  it("assigns income to the next contribution date when they fall on different weekdays", () => {
    const weeklyMondays: Schedule = {
      frequency: "weekly",
      anchorDate: d("2026-01-05"),
    };
    const plan = planContributions({
      rule: fifteenPercentOfIncome,
      schedule: weeklyMondays,
      incomes: paychecks,
      from: d("2026-01-01"),
      to: d("2026-02-02"),
    });
    expect(
      plan.map(({ date, basisCents, targetCents }) => [
        date,
        basisCents,
        targetCents,
      ]),
    ).toEqual([
      ["2026-01-05", 187_500, 28_125],
      ["2026-01-12", 0, 0],
      ["2026-01-19", 187_500, 28_125],
      ["2026-01-26", 0, 0],
      ["2026-02-02", 187_500, 28_125],
    ]);
  });

  it("applies a minimum on dates without income", () => {
    const plan = planContributions({
      rule: { ...fifteenPercentOfIncome, minimumCents: 1000 },
      schedule: weeklyFridays,
      incomes: paychecks,
      from: d("2026-01-01"),
      to: d("2026-01-16"),
    });
    expect(plan.map((entry) => entry.targetCents)).toEqual([
      28_125, 1000, 28_125,
    ]);
  });

  it("gives one contribution per paycheck after switching to biweekly", () => {
    const plan = planContributions({
      rule: fifteenPercentOfIncome,
      schedule: { frequency: "biweekly", anchorDate: d("2026-01-02") },
      incomes: paychecks,
      from: d("2026-01-01"),
      to: d("2026-01-31"),
    });
    expect(plan.map((entry) => entry.targetCents)).toEqual([
      28_125, 28_125, 28_125,
    ]);
  });

  it("sums semimonthly pay into a monthly contribution", () => {
    const plan = planContributions({
      rule: fifteenPercentOfIncome,
      schedule: { frequency: "monthly", dayOfMonth: "last" },
      incomes: [
        { date: d("2026-01-15"), amountCents: 200_000 },
        { date: d("2026-01-31"), amountCents: 200_000 },
      ],
      from: d("2026-01-01"),
      to: d("2026-01-31"),
    });
    expect(plan).toEqual([
      {
        date: "2026-01-31",
        basisCents: 400_000,
        targetCents: 60_000,
        source: "rule",
      },
    ]);
  });

  it("follows each paycheck for percent-of-paycheck plans, including variable pay", () => {
    const plan = planContributions({
      rule: { type: "percentOfPaycheck", percent: "0.15" },
      paychecks: [
        { date: d("2025-12-19"), amountCents: 150_000 }, // before the range
        { date: d("2026-01-02"), amountCents: 187_500 },
        { date: d("2026-01-16"), amountCents: 152_345 }, // commission
        { date: d("2026-01-16"), amountCents: 5_000 }, // second deposit the same day
        { date: d("2026-01-30"), amountCents: 138_000 },
      ],
      from: d("2026-01-01"),
      to: d("2026-01-31"),
    });
    expect(
      plan.map(({ date, basisCents, targetCents }) => [
        date,
        basisCents,
        targetCents,
      ]),
    ).toEqual([
      ["2026-01-02", 187_500, 28_125],
      ["2026-01-16", 157_345, 23_602], // 23601.75
      ["2026-01-30", 138_000, 20_700],
    ]);
  });

  it("plans fixed amounts on a schedule", () => {
    const plan = planContributions({
      rule: { type: "fixedAmount", amountCents: 25_000 },
      schedule: { frequency: "monthly", dayOfMonth: 1 },
      from: d("2026-01-01"),
      to: d("2026-03-31"),
    });
    expect(plan.map(({ date, targetCents }) => [date, targetCents])).toEqual([
      ["2026-01-01", 25_000],
      ["2026-02-01", 25_000],
      ["2026-03-01", 25_000],
    ]);
  });

  it("applies overrides and skips", () => {
    const plan = planContributions({
      rule: fifteenPercentOfIncome,
      schedule: { frequency: "biweekly", anchorDate: d("2026-01-02") },
      incomes: paychecks,
      from: d("2026-01-01"),
      to: d("2026-01-31"),
      overrides: [
        { date: d("2026-01-16"), skip: true },
        { date: d("2026-01-30"), amountCents: 50_000 },
      ],
    });
    expect(
      plan.map(({ targetCents, source }) => [targetCents, source]),
    ).toEqual([
      [28_125, "rule"],
      [0, "skipped"],
      [50_000, "override"],
    ]);
  });

  it("plans nothing while paused or for an inverted range", () => {
    const base = {
      rule: fifteenPercentOfIncome,
      schedule: weeklyFridays,
      incomes: paychecks,
    };
    expect(
      planContributions({
        ...base,
        from: d("2026-01-01"),
        to: d("2026-01-31"),
        paused: true,
      }),
    ).toEqual([]);
    expect(
      planContributions({
        ...base,
        from: d("2026-02-01"),
        to: d("2026-01-01"),
      }),
    ).toEqual([]);
  });

  it("requires the inputs each rule depends on", () => {
    const range = { from: d("2026-01-01"), to: d("2026-01-31") };
    expect(() =>
      planContributions({
        ...range,
        rule: { type: "percentOfPaycheck", percent: "0.15" },
      }),
    ).toThrow(RangeError);
    expect(() =>
      planContributions({
        ...range,
        rule: { type: "fixedAmount", amountCents: 100 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      planContributions({
        ...range,
        rule: fifteenPercentOfIncome,
        schedule: weeklyFridays,
      }),
    ).toThrow(RangeError);
  });

  it("rejects negative override amounts", () => {
    expect(() =>
      planContributions({
        rule: { type: "fixedAmount", amountCents: 100 },
        schedule: weeklyFridays,
        from: d("2026-01-01"),
        to: d("2026-01-02"),
        overrides: [{ date: d("2026-01-02"), amountCents: -1 }],
      }),
    ).toThrow(RangeError);
  });
});
