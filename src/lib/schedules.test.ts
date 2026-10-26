import { describe, expect, it } from "vitest";

import { monthsInRange, parseCalendarDate, parseYearMonth } from "./dates";
import {
  nextOccurrence,
  occurrencesBetween,
  occurrencesInMonth,
  previousOccurrence,
  validateSchedule,
  type Schedule,
} from "./schedules";

const d = parseCalendarDate;
const m = parseYearMonth;

// 2026-01-02 is a Friday.
const biweeklyFridays: Schedule = {
  frequency: "biweekly",
  anchorDate: d("2026-01-02"),
};

describe("weekly and biweekly", () => {
  it("lists every biweekly payday in a year", () => {
    const paydays = occurrencesBetween(
      biweeklyFridays,
      d("2026-01-01"),
      d("2026-12-31"),
    );
    expect(paydays).toHaveLength(26);
    expect(paydays.slice(0, 4)).toEqual([
      "2026-01-02",
      "2026-01-16",
      "2026-01-30",
      "2026-02-13",
    ]);
    expect(paydays.at(-1)).toBe("2026-12-18");
  });

  it("finds the months with three biweekly paychecks", () => {
    const threePaycheckMonths = monthsInRange(
      m("2026-01"),
      m("2026-12"),
    ).filter(
      (month) => occurrencesInMonth(biweeklyFridays, month).length === 3,
    );
    expect(threePaycheckMonths).toEqual(["2026-01", "2026-07"]);
    expect(occurrencesInMonth(biweeklyFridays, m("2026-07"))).toEqual([
      "2026-07-03",
      "2026-07-17",
      "2026-07-31",
    ]);
  });

  it("extends before the anchor date", () => {
    expect(
      occurrencesBetween(biweeklyFridays, d("2025-12-01"), d("2025-12-31")),
    ).toEqual(["2025-12-05", "2025-12-19"]);
  });

  it("lists weekly occurrences, including five-week months", () => {
    const weekly: Schedule = {
      frequency: "weekly",
      anchorDate: d("2026-10-23"),
    };
    expect(occurrencesInMonth(weekly, m("2026-10"))).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
  });

  it("supports custom day intervals", () => {
    const everyTenDays: Schedule = {
      frequency: "everyNDays",
      anchorDate: d("2026-01-01"),
      intervalDays: 10,
    };
    expect(occurrencesInMonth(everyTenDays, m("2026-01"))).toEqual([
      "2026-01-01",
      "2026-01-11",
      "2026-01-21",
      "2026-01-31",
    ]);
  });
});

describe("semimonthly and monthly", () => {
  it("handles the 15th and the last day", () => {
    const schedule: Schedule = {
      frequency: "semimonthly",
      daysOfMonth: [15, "last"],
    };
    expect(occurrencesInMonth(schedule, m("2026-02"))).toEqual([
      "2026-02-15",
      "2026-02-28",
    ]);
    expect(occurrencesInMonth(schedule, m("2028-02"))).toEqual([
      "2028-02-15",
      "2028-02-29",
    ]);
    expect(
      occurrencesBetween(schedule, d("2026-01-01"), d("2026-12-31")),
    ).toHaveLength(24);
  });

  it("merges days that clamp to the same date in short months", () => {
    const schedule: Schedule = {
      frequency: "semimonthly",
      daysOfMonth: [30, "last"],
    };
    expect(occurrencesInMonth(schedule, m("2026-02"))).toEqual(["2026-02-28"]);
    expect(occurrencesInMonth(schedule, m("2026-03"))).toEqual([
      "2026-03-30",
      "2026-03-31",
    ]);
  });

  it("clamps monthly days past the end of the month", () => {
    const schedule: Schedule = { frequency: "monthly", dayOfMonth: 31 };
    expect(
      occurrencesBetween(schedule, d("2026-01-01"), d("2026-04-30")),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("supports the last day of the month", () => {
    const schedule: Schedule = { frequency: "monthly", dayOfMonth: "last" };
    expect(occurrencesInMonth(schedule, m("2028-02"))).toEqual(["2028-02-29"]);
  });

  it("repeats every N months from the anchor without drifting", () => {
    const monthlyFromJan31: Schedule = {
      frequency: "everyNMonths",
      anchorDate: d("2026-01-31"),
      intervalMonths: 1,
    };
    expect(
      occurrencesBetween(monthlyFromJan31, d("2026-01-01"), d("2026-03-31")),
    ).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // not the 28th
    ]);

    const quarterly: Schedule = {
      frequency: "everyNMonths",
      anchorDate: d("2026-01-15"),
      intervalMonths: 3,
    };
    expect(
      occurrencesBetween(quarterly, d("2025-10-01"), d("2026-12-31")),
    ).toEqual([
      "2025-10-15",
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });
});

describe("weekend adjustment", () => {
  // 2026-02-15 is a Sunday and 2026-02-28 a Saturday.
  const semimonthly: Schedule = {
    frequency: "semimonthly",
    daysOfMonth: [15, "last"],
  };

  it("moves weekend dates to the previous business day", () => {
    expect(
      occurrencesInMonth(
        { ...semimonthly, weekendAdjustment: "previousBusinessDay" },
        m("2026-02"),
      ),
    ).toEqual(["2026-02-13", "2026-02-27"]);
  });

  it("moves weekend dates to the next business day, even into the next month", () => {
    const schedule: Schedule = {
      ...semimonthly,
      weekendAdjustment: "nextBusinessDay",
    };
    // January's last day (Sat 2026-01-31) arrives Mon 2026-02-02; Sat 2026-02-28 moves to March.
    expect(occurrencesInMonth(schedule, m("2026-02"))).toEqual([
      "2026-02-02",
      "2026-02-16",
    ]);
    // 2026-03-15 is a Sunday; 2026-03-31 is a Tuesday.
    expect(occurrencesInMonth(schedule, m("2026-03"))).toEqual([
      "2026-03-02",
      "2026-03-16",
      "2026-03-31",
    ]);
  });

  it("can pull a 1st-of-month date into the previous month", () => {
    // 2026-02-01 and 2026-03-01 are Sundays.
    const firstOfMonth: Schedule = {
      frequency: "monthly",
      dayOfMonth: 1,
      weekendAdjustment: "previousBusinessDay",
    };
    expect(occurrencesInMonth(firstOfMonth, m("2026-01"))).toEqual([
      "2026-01-01",
      "2026-01-30",
    ]);
    expect(occurrencesInMonth(firstOfMonth, m("2026-02"))).toEqual([
      "2026-02-27",
    ]);
  });
});

describe("next and previous occurrence", () => {
  it("finds the next occurrence on or after a date", () => {
    expect(nextOccurrence(biweeklyFridays, d("2026-01-03"))).toBe("2026-01-16");
    expect(nextOccurrence(biweeklyFridays, d("2026-01-16"))).toBe("2026-01-16");
  });

  it("finds the previous occurrence on or before a date", () => {
    expect(previousOccurrence(biweeklyFridays, d("2026-01-15"))).toBe(
      "2026-01-02",
    );
    expect(previousOccurrence(biweeklyFridays, d("2026-01-02"))).toBe(
      "2026-01-02",
    );
  });

  it("searches far enough for long intervals", () => {
    const everyTenYears: Schedule = {
      frequency: "everyNMonths",
      anchorDate: d("2026-01-15"),
      intervalMonths: 120,
    };
    expect(nextOccurrence(everyTenYears, d("2026-01-16"))).toBe("2036-01-15");
    expect(previousOccurrence(everyTenYears, d("2036-01-14"))).toBe(
      "2026-01-15",
    );
  });
});

describe("ranges", () => {
  it("returns nothing for an inverted range", () => {
    expect(
      occurrencesBetween(biweeklyFridays, d("2026-02-01"), d("2026-01-01")),
    ).toEqual([]);
  });

  it("refuses unreasonably long ranges", () => {
    expect(() =>
      occurrencesBetween(biweeklyFridays, d("1950-01-01"), d("2060-01-01")),
    ).toThrow(RangeError);
  });
});

describe("validateSchedule", () => {
  it("accepts valid schedules", () => {
    expect(validateSchedule(biweeklyFridays)).toEqual({ ok: true });
    expect(
      validateSchedule({ frequency: "semimonthly", daysOfMonth: [1, 15] }),
    ).toEqual({
      ok: true,
    });
  });

  it.each<[string, unknown]>([
    ["day 0", { frequency: "monthly", dayOfMonth: 0 }],
    ["day 32", { frequency: "monthly", dayOfMonth: 32 }],
    ["fractional day", { frequency: "monthly", dayOfMonth: 1.5 }],
    ["days out of order", { frequency: "semimonthly", daysOfMonth: [15, 1] }],
    [
      "last before a day",
      { frequency: "semimonthly", daysOfMonth: ["last", 15] },
    ],
    ["three days", { frequency: "semimonthly", daysOfMonth: [1, 10, 20] }],
    [
      "zero-day interval",
      { frequency: "everyNDays", anchorDate: "2026-01-01", intervalDays: 0 },
    ],
    [
      "interval too long",
      {
        frequency: "everyNMonths",
        anchorDate: "2026-01-01",
        intervalMonths: 121,
      },
    ],
    ["impossible anchor", { frequency: "weekly", anchorDate: "2026-02-30" }],
    [
      "unknown frequency",
      { frequency: "fortnightly", anchorDate: "2026-01-01" },
    ],
    [
      "unknown adjustment",
      { frequency: "monthly", dayOfMonth: 1, weekendAdjustment: "sometimes" },
    ],
  ])("rejects %s", (_label, schedule) => {
    expect(validateSchedule(schedule as Schedule).ok).toBe(false);
    expect(() =>
      occurrencesBetween(
        schedule as Schedule,
        d("2026-01-01"),
        d("2026-12-31"),
      ),
    ).toThrow(RangeError);
  });
});
