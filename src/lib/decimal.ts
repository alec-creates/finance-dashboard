import DecimalJs from "decimal.js";

/**
 * Decimal constructor used for every non-cents number in the app: share and crypto quantities, prices, rates and
 * percentages. Precision is far above any value we store, so multiplication is exact in practice, and the default
 * rounding is half-even (banker's rounding). Exponent notation is disabled so `toString()` is always plain.
 */
export const Decimal = DecimalJs.clone({
  precision: 80,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -80,
  toExpPos: 80,
});
export type Decimal = DecimalJs;

/**
 * Accepted inputs. Fractional values must be strings (or Decimals) so a float like 0.1 can never leak in; plain
 * numbers are only accepted when they are safe integers.
 */
export type DecimalInput = string | number | bigint | DecimalJs;

/** How a value is rounded to a fixed number of places. `halfUp` rounds ties away from zero. */
export type RoundingMode = "halfEven" | "halfUp" | "floor" | "ceil";

const ROUNDING: Record<RoundingMode, DecimalJs.Rounding> = {
  halfEven: DecimalJs.ROUND_HALF_EVEN,
  halfUp: DecimalJs.ROUND_HALF_UP,
  floor: DecimalJs.ROUND_FLOOR,
  ceil: DecimalJs.ROUND_CEIL,
};

const DECIMAL_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function toDecimal(value: DecimalInput): Decimal {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!DECIMAL_STRING.test(trimmed)) {
      throw new RangeError("Invalid decimal string");
    }
    return new Decimal(trimmed);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        "Only safe integers may be passed as numbers; pass fractional values as strings",
      );
    }
    return new Decimal(value);
  }
  if (typeof value === "bigint") {
    return new Decimal(value.toString());
  }
  if (DecimalJs.isDecimal(value)) {
    if (!value.isFinite()) {
      throw new RangeError("Decimal must be finite");
    }
    return new Decimal(value);
  }
  throw new TypeError("Unsupported decimal input");
}

export function roundDecimal(
  value: DecimalInput,
  decimalPlaces: number,
  rounding: RoundingMode = "halfEven",
): Decimal {
  return toDecimal(value).toDecimalPlaces(decimalPlaces, ROUNDING[rounding]);
}

/** Rounds to a whole number and returns it as a JS number, rejecting values outside the safe-integer range. */
export function toSafeInteger(
  value: DecimalInput,
  rounding: RoundingMode = "halfEven",
): number {
  const rounded = roundDecimal(value, 0, rounding);
  const result = rounded.toNumber();
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Value is outside the safe integer range");
  }
  return result === 0 ? 0 : result; // never return -0
}

export function sumDecimals(values: readonly DecimalInput[]): Decimal {
  return values.reduce<Decimal>(
    (total, value) => total.plus(toDecimal(value)),
    new Decimal(0),
  );
}

/** Database column shapes from docs/data-model.md: Decimal(precision, scale). */
export const DECIMAL_COLUMNS = {
  quantity: { precision: 38, scale: 18 },
  price: { precision: 24, scale: 10 },
  rate: { precision: 24, scale: 12 },
  percent: { precision: 7, scale: 6 },
} as const;

export type DecimalColumn = keyof typeof DECIMAL_COLUMNS;

/**
 * Rounds a value to a column's scale (half-even) and checks that it fits the column's precision, so values are
 * normalized the same way before they are compared, stored or summed.
 */
export function toColumnDecimal(
  value: DecimalInput,
  column: DecimalColumn,
): Decimal {
  const { precision, scale } = DECIMAL_COLUMNS[column];
  const rounded = roundDecimal(value, scale);
  const integerDigits = rounded
    .abs()
    .truncated()
    .toFixed()
    .replace(/^0$/, "").length;
  if (integerDigits > precision - scale) {
    throw new RangeError(`Value does not fit a ${column} column`);
  }
  return rounded;
}

/** Share or crypto quantity, normalized to 18 decimal places. */
export function toQuantity(value: DecimalInput): Decimal {
  return toColumnDecimal(value, "quantity");
}

/** Unit price in USD, normalized to 10 decimal places. */
export function toPrice(value: DecimalInput): Decimal {
  return toColumnDecimal(value, "price");
}

/** Exchange or interest rate, normalized to 12 decimal places. */
export function toRate(value: DecimalInput): Decimal {
  return toColumnDecimal(value, "rate");
}

/**
 * Plain-string form with trailing zeros removed, for display or JSON. `maxDecimalPlaces` rounds half-even first.
 */
export function formatDecimal(
  value: DecimalInput,
  maxDecimalPlaces?: number,
): string {
  const decimal =
    maxDecimalPlaces === undefined
      ? toDecimal(value)
      : roundDecimal(value, maxDecimalPlaces);
  const text = decimal.toFixed();
  return text === "-0" ? "0" : text;
}
