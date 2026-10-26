import { describe, expect, it } from "vitest";

import {
  absCents,
  addCents,
  allocateCents,
  averageCents,
  centsToDecimal,
  centsToDecimalString,
  decimalUsdToCents,
  formatUsd,
  isCents,
  multiplyCents,
  negateCents,
  parseUsdToCents,
  percentOfCents,
  prorateCents,
  splitEvenly,
  subtractCents,
  sumCents,
} from "./money";

describe("cents arithmetic", () => {
  it("adds and subtracts exactly where floats would drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the reason money is stored in cents
    expect(addCents(10, 20)).toBe(30);
    expect(sumCents([1999, 1, -500])).toBe(1500);
    expect(subtractCents(1000, 1001)).toBe(-1);
  });

  it("returns 0 rather than -0", () => {
    expect(Object.is(negateCents(0), 0)).toBe(true);
    expect(Object.is(sumCents([5, -5]), 0)).toBe(true);
    expect(Object.is(subtractCents(-5, -5), 0)).toBe(true);
    expect(absCents(-250)).toBe(250);
  });

  it("rejects fractional cents and unsafe integers", () => {
    expect(() => addCents(10, 0.5)).toThrow(RangeError);
    expect(() => subtractCents(Number.NaN, 1)).toThrow(RangeError);
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(isCents(12)).toBe(true);
    expect(isCents(1.5)).toBe(false);
    expect(isCents("12")).toBe(false);
  });

  it("sums an empty list to zero", () => {
    expect(sumCents([])).toBe(0);
  });
});

describe("multiplyCents and percentOfCents", () => {
  it("computes a contribution example: 15% of $1,875.00 is $281.25", () => {
    expect(percentOfCents(187_500, "0.15")).toBe(28_125);
  });

  it("rounds half-even by default", () => {
    expect(percentOfCents(187_533, "0.15")).toBe(28_130); // 28129.95
    expect(multiplyCents(1001, "0.5")).toBe(500); // 500.5 -> even
    expect(multiplyCents(1003, "0.5")).toBe(502); // 501.5 -> even
    expect(multiplyCents(-1001, "0.5")).toBe(-500);
  });

  it("supports explicit rounding modes", () => {
    expect(multiplyCents(1001, "0.5", "halfUp")).toBe(501);
    expect(multiplyCents(-1001, "0.5", "halfUp")).toBe(-501); // ties away from zero
    expect(multiplyCents(-1001, "0.5", "floor")).toBe(-501);
    expect(multiplyCents(-1001, "0.5", "ceil")).toBe(-500);
  });

  it("refuses float factors so 0.1-style errors cannot enter", () => {
    expect(() => percentOfCents(1000, 0.2)).toThrow(TypeError);
    expect(percentOfCents(1000, 2)).toBe(2000); // integers are fine
  });
});

describe("prorateCents", () => {
  it("prorates a monthly amount by days", () => {
    expect(prorateCents(35_000, 10, 31)).toBe(11_290); // 11290.32
    expect(prorateCents(100, 1, 3)).toBe(33);
    expect(prorateCents(200, 1, 3)).toBe(67);
    expect(prorateCents(35_000, 31, 31)).toBe(35_000);
  });

  it("rejects a zero or fractional denominator", () => {
    expect(() => prorateCents(100, 1, 0)).toThrow(RangeError);
    expect(() => prorateCents(100, 1, 1.5)).toThrow(RangeError);
  });
});

describe("averageCents", () => {
  it("averages and rounds half-even", () => {
    expect(averageCents([100, 200, 300])).toBe(200);
    expect(averageCents([1, 2])).toBe(2); // 1.5 -> 2
    expect(averageCents([1, 0])).toBe(0); // 0.5 -> 0
  });

  it("returns null for no data instead of zero", () => {
    expect(averageCents([])).toBeNull();
  });
});

describe("allocateCents (largest remainder)", () => {
  it("splits so the parts always sum to the total", () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateCents(28_000, ["0.7", "0.3"])).toEqual([19_600, 8_400]);
  });

  it("gives leftover cents to the largest remainders", () => {
    // 19604.9 / 8402.1 -> the 0.9 remainder gets the extra cent
    expect(allocateCents(28_007, ["0.7", "0.3"])).toEqual([19_605, 8_402]);
    expect(allocateCents(1, [1, 2])).toEqual([0, 1]);
  });

  it("breaks remainder ties by larger weight, then earlier position", () => {
    expect(allocateCents(2, [1, 3])).toEqual([0, 2]); // 0.5 / 1.5
    expect(allocateCents(5, [1, 0, 1])).toEqual([3, 0, 2]); // 2.5 / 0 / 2.5
  });

  it("treats weights proportionally, not as fractions that must sum to 1", () => {
    expect(allocateCents(1000, [3, 1])).toEqual([750, 250]);
  });

  it("splits negative totals symmetrically", () => {
    expect(allocateCents(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("never gives cents to zero weights", () => {
    expect(allocateCents(7, [0, 1, 0])).toEqual([0, 7, 0]);
  });

  it("rejects empty, negative or all-zero weights", () => {
    expect(() => allocateCents(100, [])).toThrow(RangeError);
    expect(() => allocateCents(100, [1, -1])).toThrow(RangeError);
    expect(() => allocateCents(100, [0, 0])).toThrow(RangeError);
    expect(() => allocateCents(1.5, [1])).toThrow(RangeError);
  });

  it("conserves the total for many generated cases", () => {
    // Park-Miller generator: deterministic, and every product stays within safe integers.
    let seed = 42;
    const next = () => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed;
    };
    for (let run = 0; run < 500; run += 1) {
      const total = (next() % 2_000_001) - 1_000_000;
      const weights = Array.from(
        { length: (next() % 6) + 1 },
        () => next() % 1000,
      );
      if (!weights.some((weight) => weight > 0)) {
        weights[0] = 1;
      }
      const parts = allocateCents(total, weights);
      expect(sumCents(parts)).toBe(total);
      parts.forEach((part, index) => {
        if (weights[index] === 0) {
          expect(part).toBe(0);
        }
      });
    }
  });
});

describe("splitEvenly", () => {
  it("splits into near-equal parts", () => {
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(9, 3)).toEqual([3, 3, 3]);
  });

  it("requires a positive integer number of parts", () => {
    expect(() => splitEvenly(10, 0)).toThrow(RangeError);
    expect(() => splitEvenly(10, 1.5)).toThrow(RangeError);
  });
});

describe("decimal conversions", () => {
  it("converts USD decimals to cents with one half-even rounding", () => {
    expect(decimalUsdToCents("12.34")).toBe(1234);
    expect(decimalUsdToCents("12.345")).toBe(1234); // 1234.5 -> even
    expect(decimalUsdToCents("12.355")).toBe(1236); // 1235.5 -> even
    expect(decimalUsdToCents("0.005")).toBe(0);
    expect(decimalUsdToCents("0.005", "halfUp")).toBe(1);
    expect(decimalUsdToCents("-0.004")).toBe(0);
  });

  it("converts cents to exact decimals and strings", () => {
    expect(centsToDecimal(1).toString()).toBe("0.01");
    expect(centsToDecimalString(123_456)).toBe("1234.56");
    expect(centsToDecimalString(-5)).toBe("-0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
    expect(centsToDecimalString(Number.MAX_SAFE_INTEGER)).toBe(
      "90071992547409.91",
    );
  });
});

describe("parseUsdToCents", () => {
  it.each([
    ["1234.5", 123_450],
    ["$1,234.56", 123_456],
    ["-12.30", -1230],
    ["-$12.30", -1230],
    ["$-12.30", -1230],
    ["(12.30)", -1230],
    ["($1,000.00)", -100_000],
    ["+5", 500],
    [".5", 50],
    ["5.", 500],
    ["12.340", 1234],
    ["  7  ", 700],
    ["0", 0],
    ["12,345,678.90", 1_234_567_890],
  ])("parses %j", (input, expected) => {
    expect(parseUsdToCents(input)).toBe(expected);
  });

  it("returns 0, not -0, for negative zero", () => {
    expect(Object.is(parseUsdToCents("-0.00"), 0)).toBe(true);
  });

  it.each([
    "",
    "abc",
    "$",
    "-",
    "12.345",
    "1,23",
    "1,2345.00",
    "--5",
    "-$-5",
    "(-5)",
    "-(5)",
    "1e3",
    "12 34",
    "99999999999999999999",
  ])("rejects %j", (input) => {
    expect(() => parseUsdToCents(input)).toThrow(RangeError);
  });

  it("does not echo the input in error messages", () => {
    expect(() => parseUsdToCents("12.345")).toThrow(/^(?!.*12\.345).*$/);
  });
});

describe("formatUsd", () => {
  it("formats cents as US dollars", () => {
    expect(formatUsd(123_456)).toBe("$1,234.56");
    expect(formatUsd(-123_456)).toBe("-$1,234.56");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(5)).toBe("$0.05");
  });

  it("formats very large amounts exactly", () => {
    expect(formatUsd(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  });

  it("rounds whole-dollar display half-even", () => {
    expect(formatUsd(150, { showCents: false })).toBe("$2");
    expect(formatUsd(250, { showCents: false })).toBe("$2");
    expect(formatUsd(251, { showCents: false })).toBe("$3");
  });

  it("can always show the sign for changes", () => {
    expect(formatUsd(500, { signDisplay: "always" })).toBe("+$5.00");
    expect(formatUsd(-500, { signDisplay: "always" })).toBe("-$5.00");
  });
});
