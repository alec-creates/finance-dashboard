import { addDays, isWithin, type CalendarDate } from "./dates";
import { type DecimalInput } from "./decimal";
import { allocateCents, assertCents, percentOfCents, sumCents } from "./money";
import { toFraction, validateShares } from "./percent";
import {
  occurrencesBetween,
  previousOccurrence,
  type Schedule,
} from "./schedules";

/**
 * Planned investment contributions (ADR-0006). Everything here is a plan computed from rules; actual contributions
 * are transactions and are compared against these targets elsewhere, never mixed with them.
 */

export type ContributionRule =
  | { type: "fixedAmount"; amountCents: number }
  | { type: "percentOfPaycheck"; percent: DecimalInput; minimumCents?: number }
  | { type: "percentOfIncome"; percent: DecimalInput; minimumCents?: number };

export interface DatedAmount {
  date: CalendarDate;
  amountCents: number;
}

export type ContributionOverride =
  | { date: CalendarDate; amountCents: number }
  | { date: CalendarDate; skip: true };

export interface ContributionAllocation {
  accountId: string;
  share: DecimalInput;
}

export interface PlannedContribution {
  date: CalendarDate;
  /** Paycheck or income the percentage was applied to; null for fixed amounts. */
  basisCents: number | null;
  targetCents: number;
  source: "rule" | "override" | "skipped";
}

function assertNonNegativeCents(value: number, label: string): void {
  assertCents(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must not be negative`);
  }
}

/**
 * Target for one scheduled date. Percentage rules apply to `basisCents` (a paycheck, or income received in the
 * period), round half-even once, and never go below the minimum. A negative basis (e.g. a reversal) counts as zero.
 */
export function contributionTargetCents(
  rule: ContributionRule,
  basisCents?: number,
): number {
  if (rule.type === "fixedAmount") {
    assertNonNegativeCents(rule.amountCents, "Contribution amount");
    return rule.amountCents;
  }
  if (basisCents === undefined) {
    throw new RangeError("A percentage contribution needs an income amount");
  }
  assertCents(basisCents, "Income");
  const minimum = rule.minimumCents ?? 0;
  assertNonNegativeCents(minimum, "Minimum contribution");
  const target = percentOfCents(
    Math.max(0, basisCents),
    toFraction(rule.percent),
  );
  return Math.max(minimum, target);
}

/** Splits a contribution across accounts by share (shares must sum to exactly 1); parts sum exactly to the total. */
export function splitContribution(
  totalCents: number,
  allocations: readonly ContributionAllocation[],
): { accountId: string; amountCents: number }[] {
  const validation = validateShares(
    allocations.map((allocation) => allocation.share),
  );
  if (!validation.ok) {
    throw new RangeError(validation.error);
  }
  const amounts = allocateCents(totalCents, validation.shares);
  return allocations.map((allocation, index) => ({
    accountId: allocation.accountId,
    amountCents: amounts[index] ?? 0,
  }));
}

/** Sum of amounts dated after `afterExclusive` (or from the beginning when null) up to `throughInclusive`. */
export function sumInPeriod(
  amounts: readonly DatedAmount[],
  afterExclusive: CalendarDate | null,
  throughInclusive: CalendarDate,
): number {
  return sumCents(
    amounts
      .filter(
        ({ date }) =>
          date <= throughInclusive &&
          (afterExclusive === null || date > afterExclusive),
      )
      .map(({ amountCents }) => amountCents),
  );
}

export interface PlanContributionsInput {
  rule: ContributionRule;
  from: CalendarDate;
  to: CalendarDate;
  /** Contribution dates; required for fixedAmount and percentOfIncome. */
  schedule?: Schedule;
  /** Take-home paychecks (actual or projected); required for percentOfPaycheck. */
  paychecks?: readonly DatedAmount[];
  /** Income received (actual or projected); required for percentOfIncome. */
  incomes?: readonly DatedAmount[];
  overrides?: readonly ContributionOverride[];
  paused?: boolean;
}

/**
 * Planned contributions dated from `from` to `to`, inclusive.
 *
 * - fixedAmount: the amount on every scheduled date.
 * - percentOfPaycheck: on each payday, percent x that day's take-home pay (paychecks on the same day are combined).
 * - percentOfIncome: on each scheduled date, percent x income received since the previous scheduled date
 *   (exclusive) through this date (inclusive). Works for any pay and contribution frequency; some periods may be 0.
 *
 * Overrides replace or skip the target for a date. A paused plan has no planned contributions.
 */
export function planContributions(
  input: PlanContributionsInput,
): PlannedContribution[] {
  const { rule, from, to, paused = false } = input;
  if (paused || from > to) {
    return [];
  }
  const overrides = new Map(
    input.overrides?.map((override) => [override.date, override]),
  );

  let planned: Omit<PlannedContribution, "source">[];
  if (rule.type === "percentOfPaycheck") {
    if (!input.paychecks) {
      throw new RangeError("percentOfPaycheck plans need paychecks");
    }
    const byDate = new Map<CalendarDate, number[]>();
    for (const paycheck of input.paychecks) {
      if (isWithin(paycheck.date, from, to)) {
        byDate.set(paycheck.date, [
          ...(byDate.get(paycheck.date) ?? []),
          paycheck.amountCents,
        ]);
      }
    }
    planned = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, amounts]) => {
        const basisCents = sumCents(amounts);
        return {
          date,
          basisCents,
          targetCents: contributionTargetCents(rule, basisCents),
        };
      });
  } else {
    if (!input.schedule) {
      throw new RangeError(`${rule.type} plans need a schedule`);
    }
    const schedule = input.schedule;
    const dates = occurrencesBetween(schedule, from, to);
    if (rule.type === "fixedAmount") {
      planned = dates.map((date) => ({
        date,
        basisCents: null,
        targetCents: contributionTargetCents(rule),
      }));
    } else {
      if (!input.incomes) {
        throw new RangeError("percentOfIncome plans need incomes");
      }
      const incomes = input.incomes;
      planned = dates.map((date) => {
        const periodStart = previousOccurrence(schedule, addDays(date, -1));
        const basisCents = sumInPeriod(incomes, periodStart, date);
        return {
          date,
          basisCents,
          targetCents: contributionTargetCents(rule, basisCents),
        };
      });
    }
  }

  return planned.map((contribution) => {
    const override = overrides.get(contribution.date);
    if (!override) {
      return { ...contribution, source: "rule" };
    }
    if ("skip" in override) {
      return { ...contribution, targetCents: 0, source: "skipped" };
    }
    assertNonNegativeCents(override.amountCents, "Override amount");
    return {
      ...contribution,
      targetCents: override.amountCents,
      source: "override",
    };
  });
}
