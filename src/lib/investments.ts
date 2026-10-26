import {
  Decimal,
  toDecimal,
  toPrice,
  toQuantity,
  type DecimalInput,
} from "./decimal";
import { assertCents, decimalUsdToCents, subtractCents } from "./money";
import { ratioOf } from "./percent";

/** Market value in cents of a holding: quantity x unit price, computed exactly and rounded half-even once. */
export function marketValueCents(
  quantity: DecimalInput,
  unitPrice: DecimalInput,
): number {
  return decimalUsdToCents(toQuantity(quantity).times(toPrice(unitPrice)));
}

/** Average cost per unit (USD, 10 decimal places) for a position with a known total cost basis. */
export function averageUnitCost(
  totalCostCents: number,
  quantity: DecimalInput,
): Decimal {
  assertCents(totalCostCents, "Cost basis");
  const units = toQuantity(quantity);
  if (!units.greaterThan(0)) {
    throw new RangeError("Quantity must be greater than zero");
  }
  return toPrice(new Decimal(totalCostCents).dividedBy(100).dividedBy(units));
}

export interface Gain {
  gainCents: number;
  /** Gain relative to cost basis; null when cost basis is zero or unknown. */
  gainFraction: Decimal | null;
}

/** Unrealized gain or loss of a holding. Market gains are reported separately from contributions. */
export function unrealizedGain(
  marketValueCents: number,
  costBasisCents: number | null,
): Gain | null {
  if (costBasisCents === null) {
    return null;
  }
  const gainCents = subtractCents(marketValueCents, costBasisCents);
  return { gainCents, gainFraction: ratioOf(gainCents, costBasisCents) };
}

/** Sum of quantities (e.g. lots of the same asset), normalized to the quantity scale. */
export function sumQuantities(quantities: readonly DecimalInput[]): Decimal {
  return toQuantity(
    quantities.reduce<Decimal>(
      (total, quantity) => total.plus(toDecimal(quantity)),
      new Decimal(0),
    ),
  );
}
