import { describe, expect, it } from "vitest";

import {
  formatPercent,
  fractionToPercentPoints,
  percentPointsToFraction,
  ratioOf,
  sharesOfTotal,
  toFraction,
  validateShares,
} from "./percent";

describe("toFraction", () => {
  it("normalizes to 6 decimal places, half-even", () => {
    expect(toFraction("0.2").toString()).toBe("0.2");
    expect(toFraction("0.1234565").toString()).toBe("0.123456");
    expect(toFraction("0.1234575").toString()).toBe("0.123458");
  });

  it("enforces 0..1 by default", () => {
    expect(() => toFraction("1.2")).toThrow(RangeError);
    expect(() => toFraction("-0.1")).toThrow(RangeError);
    expect(toFraction("1").toString()).toBe("1");
    expect(toFraction("0").toString()).toBe("0");
  });

  it("accepts custom bounds", () => {
    expect(toFraction("1.5", { max: 2 }).toString()).toBe("1.5");
    expect(toFraction("-0.25", { min: -1 }).toString()).toBe("-0.25");
  });
});

describe("percent points", () => {
  it("converts between form values and fractions", () => {
    expect(percentPointsToFraction("20").toString()).toBe("0.2");
    expect(percentPointsToFraction("33.3333333").toString()).toBe("0.333333");
    expect(fractionToPercentPoints("0.2").toString()).toBe("20");
    expect(() => percentPointsToFraction("120")).toThrow(RangeError);
  });
});

describe("validateShares", () => {
  it("accepts shares that add up to exactly 100%", () => {
    expect(validateShares(["0.7", "0.3"]).ok).toBe(true);
    expect(validateShares(["1"]).ok).toBe(true);
    expect(validateShares(["0.333333", "0.333333", "0.333334"]).ok).toBe(true);
  });

  it("rejects shares that do not add up", () => {
    expect(validateShares(["0.7", "0.4"])).toEqual({
      ok: false,
      error: "Shares must add up to exactly 100%",
    });
    expect(validateShares(["0.333333", "0.333333", "0.333333"]).ok).toBe(false);
  });

  it("rejects out-of-range shares and empty lists", () => {
    expect(validateShares(["1.2", "-0.2"]).ok).toBe(false);
    expect(validateShares([]).ok).toBe(false);
    expect(validateShares(["abc"]).ok).toBe(false);
  });
});

describe("ratioOf", () => {
  it("returns full-precision ratios", () => {
    expect(ratioOf(25, 100)?.toString()).toBe("0.25");
    expect(ratioOf(1, 3)?.toFixed(6)).toBe("0.333333");
    expect(ratioOf(-50, 100)?.toString()).toBe("-0.5");
  });

  it("returns null when the whole is zero", () => {
    expect(ratioOf(1, 0)).toBeNull();
  });
});

describe("sharesOfTotal", () => {
  it("returns fractions that sum to exactly 1", () => {
    const shares = sharesOfTotal([1, 1, 1]);
    expect(shares.map((share) => share.toString())).toEqual([
      "0.333334",
      "0.333333",
      "0.333333",
    ]);
    expect(shares.reduce((sum, share) => sum.plus(share)).toString()).toBe("1");
    expect(sharesOfTotal([300, 100]).map(String)).toEqual(["0.75", "0.25"]);
  });

  it("returns zeros when everything is zero", () => {
    expect(sharesOfTotal([0, 0]).map(String)).toEqual(["0", "0"]);
  });

  it("rejects negative values", () => {
    expect(() => sharesOfTotal([100, -1])).toThrow(RangeError);
  });
});

describe("formatPercent", () => {
  it("formats fractions as percentages, half-even", () => {
    expect(formatPercent("0.2")).toBe("20%");
    expect(formatPercent("0.33333")).toBe("33.3%");
    expect(formatPercent("1")).toBe("100%");
    expect(formatPercent("0.00125", 2)).toBe("0.12%");
  });
});
