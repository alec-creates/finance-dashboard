import { describe, expect, it } from "vitest";

import {
  averageUnitCost,
  marketValueCents,
  sumQuantities,
  unrealizedGain,
} from "./investments";

describe("marketValueCents", () => {
  it("values whole shares", () => {
    expect(marketValueCents("10", "123.45")).toBe(123_450);
  });

  it("values fractional shares and rounds half-even once", () => {
    expect(marketValueCents("0.5", "100.01")).toBe(5000); // $50.005 -> $50.00
    expect(marketValueCents("0.5", "100.03")).toBe(5002); // $50.015 -> $50.02
  });

  it("values small crypto quantities exactly", () => {
    // 0.00012345 BTC x $65,432.10 = $8.077592745
    expect(marketValueCents("0.00012345", "65432.10")).toBe(808);
    expect(marketValueCents("1.000000000000000001", "2500")).toBe(250_000);
  });

  it("returns zero for an empty position", () => {
    expect(marketValueCents("0", "123.45")).toBe(0);
  });
});

describe("averageUnitCost", () => {
  it("divides cost basis by quantity at price precision", () => {
    expect(averageUnitCost(100_000, "3").toFixed()).toBe("333.3333333333");
    expect(averageUnitCost(5000, "0.5").toFixed()).toBe("100");
  });

  it("rejects zero or negative quantities", () => {
    expect(() => averageUnitCost(100, "0")).toThrow(RangeError);
    expect(() => averageUnitCost(100, "-1")).toThrow(RangeError);
  });
});

describe("unrealizedGain", () => {
  it("reports gains and losses against cost basis", () => {
    const gain = unrealizedGain(150_000, 100_000);
    expect(gain?.gainCents).toBe(50_000);
    expect(gain?.gainFraction?.toString()).toBe("0.5");
    expect(unrealizedGain(80_000, 100_000)?.gainFraction?.toString()).toBe(
      "-0.2",
    );
  });

  it("returns null when cost basis is unknown, and no ratio for a zero basis", () => {
    expect(unrealizedGain(100, null)).toBeNull();
    expect(unrealizedGain(100, 0)).toEqual({
      gainCents: 100,
      gainFraction: null,
    });
  });
});

describe("sumQuantities", () => {
  it("sums lots exactly", () => {
    expect(sumQuantities(["0.1", "0.2"]).toFixed()).toBe("0.3");
    expect(sumQuantities(["0.000000000000000001", "1"]).toFixed()).toBe(
      "1.000000000000000001",
    );
  });
});
