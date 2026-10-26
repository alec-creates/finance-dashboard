import DecimalJs from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  formatDecimal,
  roundDecimal,
  sumDecimals,
  toDecimal,
  toPrice,
  toQuantity,
  toRate,
  toSafeInteger,
} from "./decimal";

describe("toDecimal", () => {
  it("is exact for decimal fractions", () => {
    expect(toDecimal("0.1").plus("0.2").equals("0.3")).toBe(true);
  });

  it("accepts strings, safe integers, bigints and decimal.js instances", () => {
    expect(toDecimal(" 12.50 ").toString()).toBe("12.5");
    expect(toDecimal(-7).toString()).toBe("-7");
    expect(toDecimal(12_345_678_901_234_567_890n).toFixed()).toBe(
      "12345678901234567890",
    );
    expect(toDecimal(new DecimalJs("1.5")).toString()).toBe("1.5");
    expect(toDecimal(".5").toString()).toBe("0.5");
  });

  it("rejects float numbers so binary rounding errors cannot enter", () => {
    expect(() => toDecimal(0.1)).toThrow(TypeError);
    expect(() => toDecimal(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });

  it.each(["", "abc", "1e5", "NaN", "Infinity", "1,000", "1.2.3", "--1"])(
    "rejects the string %j",
    (input) => {
      expect(() => toDecimal(input)).toThrow(RangeError);
    },
  );

  it("rejects non-finite decimal instances", () => {
    expect(() => toDecimal(new DecimalJs(Infinity))).toThrow(RangeError);
  });

  it("never uses exponent notation", () => {
    expect(toDecimal("0.000000000000000001").toString()).toBe(
      "0.000000000000000001",
    );
  });
});

describe("rounding", () => {
  it("rounds half-even by default", () => {
    expect(roundDecimal("2.5", 0).toString()).toBe("2");
    expect(roundDecimal("3.5", 0).toString()).toBe("4");
    expect(roundDecimal("-2.5", 0).toString()).toBe("-2");
    expect(roundDecimal("1.005", 2).toString()).toBe("1");
  });

  it("supports halfUp, floor and ceil", () => {
    expect(roundDecimal("2.5", 0, "halfUp").toString()).toBe("3");
    expect(roundDecimal("-2.5", 0, "halfUp").toString()).toBe("-3");
    expect(roundDecimal("-2.1", 0, "floor").toString()).toBe("-3");
    expect(roundDecimal("2.1", 0, "ceil").toString()).toBe("3");
  });

  it("converts to safe integers without -0", () => {
    expect(toSafeInteger("41.5")).toBe(42);
    expect(Object.is(toSafeInteger("-0.4"), 0)).toBe(true);
    expect(() => toSafeInteger("9007199254740993")).toThrow(RangeError);
  });
});

describe("column normalization", () => {
  it("normalizes quantities to 18 decimal places", () => {
    expect(toQuantity("0.123456789012345678901").toFixed()).toBe(
      "0.123456789012345679",
    );
    expect(toQuantity("0.5").toFixed()).toBe("0.5"); // fractional share
    expect(toQuantity("99999999999999999999").toFixed()).toBe(
      "99999999999999999999",
    );
  });

  it("rejects quantities that do not fit Decimal(38,18)", () => {
    expect(() => toQuantity("100000000000000000000")).toThrow(RangeError);
  });

  it("normalizes prices to 10 decimal places with half-even ties", () => {
    expect(toPrice("12.34567890125").toFixed()).toBe("12.3456789012");
    expect(toPrice("12.34567890135").toFixed()).toBe("12.3456789014");
    expect(() => toPrice("100000000000000")).toThrow(RangeError); // 15 integer digits
  });

  it("normalizes rates to 12 decimal places", () => {
    expect(toRate("1.0000000000005").toFixed()).toBe("1");
  });
});

describe("helpers", () => {
  it("sums decimals exactly", () => {
    expect(sumDecimals(["0.1", "0.2", "0.3"]).toString()).toBe("0.6");
    expect(sumDecimals([]).toString()).toBe("0");
  });

  it("formats without trailing zeros and without -0", () => {
    expect(formatDecimal("1.2300")).toBe("1.23");
    expect(formatDecimal("0.000000015", 8)).toBe("0.00000002");
    expect(formatDecimal("-0.0000000001", 8)).toBe("0");
  });
});
