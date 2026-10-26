import {
  Decimal,
  toDecimal,
  toSafeInteger,
  type DecimalInput,
  type RoundingMode,
} from "./decimal";

/**
 * USD amounts are integer cents held in JS numbers (ADR-0002). Every function here rejects non-integers and results
 * outside the safe-integer range, and never returns -0. Anything that can produce fractions of a cent goes through
 * Decimal and is rounded once, half-even by default.
 */

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(value: number, label = "Amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of cents`);
  }
}

function checkedResult(value: number): number {
  assertCents(value, "Result");
  return value === 0 ? 0 : value;
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
    assertCents(total, "Sum");
  }
  return total === 0 ? 0 : total;
}

export function addCents(...values: number[]): number {
  return sumCents(values);
}

export function subtractCents(minuend: number, subtrahend: number): number {
  assertCents(minuend);
  assertCents(subtrahend);
  return checkedResult(minuend - subtrahend);
}

export function negateCents(cents: number): number {
  assertCents(cents);
  return checkedResult(-cents);
}

export function absCents(cents: number): number {
  assertCents(cents);
  return checkedResult(Math.abs(cents));
}

/** cents x factor, rounded once. Use for ratios such as a take-home ratio. */
export function multiplyCents(
  cents: number,
  factor: DecimalInput,
  rounding: RoundingMode = "halfEven",
): number {
  assertCents(cents);
  return toSafeInteger(new Decimal(cents).times(toDecimal(factor)), rounding);
}

/** A percentage of an amount, where `fraction` is 0.2 for 20%. */
export function percentOfCents(
  cents: number,
  fraction: DecimalInput,
  rounding: RoundingMode = "halfEven",
): number {
  return multiplyCents(cents, fraction, rounding);
}

/** cents x numerator / denominator, e.g. a monthly budget prorated to the days remaining in the month. */
export function prorateCents(
  cents: number,
  numerator: number,
  denominator: number,
  rounding: RoundingMode = "halfEven",
): number {
  assertCents(cents);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError("Proration terms must be integers");
  }
  if (denominator === 0) {
    throw new RangeError("Proration denominator must not be zero");
  }
  return toSafeInteger(
    new Decimal(cents).times(numerator).dividedBy(denominator),
    rounding,
  );
}

/** Mean of a list of amounts, or null when the list is empty (no data is not the same as zero). */
export function averageCents(
  values: readonly number[],
  rounding: RoundingMode = "halfEven",
): number | null {
  if (values.length === 0) {
    return null;
  }
  return toSafeInteger(
    new Decimal(sumCents(values)).dividedBy(values.length),
    rounding,
  );
}

/**
 * Splits an amount in proportion to weights so the parts always sum exactly to the total (largest-remainder method).
 * Leftover cents go to the parts with the largest fractional remainders; ties go to the larger weight, then to the
 * earlier part. A negative total is split like its absolute value and negated. Parts with weight 0 receive 0.
 */
export function allocateCents(
  totalCents: number,
  weights: readonly DecimalInput[],
): number[] {
  assertCents(totalCents, "Total");
  if (weights.length === 0) {
    throw new RangeError("At least one weight is required");
  }
  const decimals = weights.map((weight) => toDecimal(weight));
  if (decimals.some((weight) => weight.isNegative() && !weight.isZero())) {
    throw new RangeError("Weights must not be negative");
  }
  const weightTotal = decimals.reduce(
    (total, weight) => total.plus(weight),
    new Decimal(0),
  );
  if (weightTotal.isZero()) {
    throw new RangeError("Weights must not all be zero");
  }

  const sign = totalCents < 0 ? -1 : 1;
  const absoluteTotal = Math.abs(totalCents);
  const parts = decimals.map((weight, index) => {
    const exact = new Decimal(absoluteTotal)
      .times(weight)
      .dividedBy(weightTotal);
    const base = exact.floor();
    return {
      index,
      weight,
      base: base.toNumber(),
      remainder: exact.minus(base),
    };
  });

  let leftover =
    absoluteTotal - parts.reduce((total, part) => total + part.base, 0);
  const byPriority = [...parts].sort(
    (a, b) =>
      b.remainder.comparedTo(a.remainder) ||
      b.weight.comparedTo(a.weight) ||
      a.index - b.index,
  );
  const amounts = parts.map((part) => part.base);
  for (const part of byPriority) {
    if (leftover === 0) {
      break;
    }
    amounts[part.index] = (amounts[part.index] ?? 0) + 1;
    leftover -= 1;
  }
  return amounts.map((amount) => (amount === 0 ? 0 : sign * amount));
}

/** Splits an amount into `parts` near-equal pieces that sum exactly to the total. */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError("Parts must be a positive integer");
  }
  return allocateCents(
    totalCents,
    Array.from({ length: parts }, () => 1),
  );
}

/** Converts a USD decimal amount (e.g. "12.345") to cents, rounding once. */
export function decimalUsdToCents(
  usd: DecimalInput,
  rounding: RoundingMode = "halfEven",
): number {
  return toSafeInteger(toDecimal(usd).times(100), rounding);
}

/** Exact USD decimal for an amount in cents. */
export function centsToDecimal(cents: number): Decimal {
  assertCents(cents);
  return new Decimal(cents).dividedBy(100);
}

/** "-1234.56" style string, exact, with no thousands separators. */
export function centsToDecimalString(cents: number): string {
  assertCents(cents);
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${dollars}.${remainder}`;
}

const USD_AMOUNT =
  /^(?<signBefore>[+-])?\$?(?<signAfter>[+-])?(?<whole>\d{1,3}(?:,\d{3})+|\d+)?(?:\.(?<fraction>\d*))?$/;

/**
 * Parses a USD amount as found in forms and bank exports: "1234.5", "$1,234.56", "-12.30", "-$12.30", "$-12.30",
 * "(12.30)" (accounting negative), "+5". More than two decimal places is rejected unless the extra digits are zeros.
 * Throws a RangeError without echoing the input, so amounts never end up in logs.
 */
export function parseUsdToCents(input: string): number {
  let text = input.trim();
  let negative = false;
  const parenthesized = /^\((.*)\)$/.exec(text);
  if (parenthesized) {
    negative = true;
    text = (parenthesized[1] ?? "").trim();
  }

  const match = USD_AMOUNT.exec(text);
  const groups = match?.groups;
  if (!groups) {
    throw new RangeError("Invalid USD amount");
  }
  const { signBefore, signAfter, whole, fraction } = groups;
  const sign = signBefore ?? signAfter;
  if ((signBefore && signAfter) || (parenthesized && sign)) {
    throw new RangeError("Invalid USD amount");
  }
  if (!whole && !fraction) {
    throw new RangeError("Invalid USD amount");
  }
  const fractionDigits = fraction ?? "";
  if (fractionDigits.length > 2 && !/^0+$/.test(fractionDigits.slice(2))) {
    throw new RangeError(
      "USD amounts cannot have more than two decimal places",
    );
  }

  const digits = `${(whole ?? "0").replaceAll(",", "")}${fractionDigits.slice(0, 2).padEnd(2, "0")}`;
  const cents = Number(digits);
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("USD amount is too large");
  }
  if (sign === "-") {
    negative = !negative;
  }
  return negative && cents !== 0 ? -cents : cents;
}

export interface FormatUsdOptions {
  /** Show cents (default) or round to whole dollars, half-even. */
  showCents?: boolean;
  /** "always" adds a "+" to positive amounts, useful for changes. */
  signDisplay?: "auto" | "always" | "exceptZero";
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$1,234.56" / "-$1,234.56". Formats from an exact decimal string, never from a float. */
export function formatUsd(
  cents: number,
  options: FormatUsdOptions = {},
): string {
  const { showCents = true, signDisplay = "auto" } = options;
  const key = `${showCents}:${signDisplay}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
      roundingMode: "halfEven",
      signDisplay,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(centsToDecimalString(cents) as `${number}`);
}
