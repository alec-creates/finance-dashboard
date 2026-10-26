import {
  Decimal,
  DECIMAL_COLUMNS,
  roundDecimal,
  toDecimal,
  type DecimalInput,
} from "./decimal";
import { allocateCents, assertCents } from "./money";

/**
 * Percentages are stored as fractions (20% = 0.2) with 6 decimal places, matching Decimal(7,6) columns.
 */
export const PERCENT_SCALE = DECIMAL_COLUMNS.percent.scale;

const PERCENT_UNITS = 10 ** PERCENT_SCALE; // 1.000000 expressed in millionths

export interface FractionBounds {
  min?: DecimalInput;
  max?: DecimalInput;
}

/** Normalizes a fraction to 6 decimal places (half-even) and checks it is within bounds (default 0..1). */
export function toFraction(
  value: DecimalInput,
  { min = 0, max = 1 }: FractionBounds = {},
): Decimal {
  const fraction = roundDecimal(value, PERCENT_SCALE);
  if (
    fraction.lessThan(toDecimal(min)) ||
    fraction.greaterThan(toDecimal(max))
  ) {
    throw new RangeError("Percentage is out of range");
  }
  return fraction.isZero() ? new Decimal(0) : fraction;
}

/** "20" (as typed in a form) -> 0.2. */
export function percentPointsToFraction(
  points: DecimalInput,
  bounds?: FractionBounds,
): Decimal {
  return toFraction(toDecimal(points).dividedBy(100), bounds);
}

/** 0.2 -> 20. */
export function fractionToPercentPoints(fraction: DecimalInput): Decimal {
  return toDecimal(fraction).times(100);
}

export type ShareValidation =
  { ok: true; shares: Decimal[] } | { ok: false; error: string };

/**
 * Checks allocation shares (e.g. 0.7 / 0.3 between two investment accounts): each between 0 and 1 and summing to
 * exactly 1 after normalization to 6 decimal places.
 */
export function validateShares(
  shares: readonly DecimalInput[],
): ShareValidation {
  if (shares.length === 0) {
    return { ok: false, error: "At least one share is required" };
  }
  let normalized: Decimal[];
  try {
    normalized = shares.map((share) => toFraction(share));
  } catch {
    return { ok: false, error: "Each share must be between 0% and 100%" };
  }
  const total = normalized.reduce(
    (sum, share) => sum.plus(share),
    new Decimal(0),
  );
  if (!total.equals(1)) {
    return { ok: false, error: "Shares must add up to exactly 100%" };
  }
  return { ok: true, shares: normalized };
}

/**
 * part / whole at full precision (round only for display), or null when the whole is zero. Used for budget used,
 * contribution rate and similar ratios.
 */
export function ratioOf(partCents: number, wholeCents: number): Decimal | null {
  assertCents(partCents, "Part");
  assertCents(wholeCents, "Whole");
  if (wholeCents === 0) {
    return null;
  }
  return new Decimal(partCents).dividedBy(wholeCents);
}

/**
 * Each value's share of the total as fractions with 6 decimal places that sum to exactly 1 (for allocation charts
 * and breakdowns). Returns all zeros when the total is zero. Values must not be negative.
 */
export function sharesOfTotal(valuesCents: readonly number[]): Decimal[] {
  for (const value of valuesCents) {
    assertCents(value, "Value");
    if (value < 0) {
      throw new RangeError("Values must not be negative");
    }
  }
  if (valuesCents.every((value) => value === 0)) {
    return valuesCents.map(() => new Decimal(0));
  }
  return allocateCents(PERCENT_UNITS, valuesCents).map((units) =>
    new Decimal(units).dividedBy(PERCENT_UNITS),
  );
}

const percentFormatters = new Map<number, Intl.NumberFormat>();

/** 0.2 -> "20%", 0.33333 -> "33.3%" (half-even). */
export function formatPercent(
  fraction: DecimalInput,
  maximumFractionDigits = 1,
): string {
  let formatter = percentFormatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits,
      roundingMode: "halfEven",
    });
    percentFormatters.set(maximumFractionDigits, formatter);
  }
  return formatter.format(toDecimal(fraction).toFixed() as `${number}`);
}
