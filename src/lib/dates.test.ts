import { afterEach, describe, expect, it, onTestFinished } from "vitest";

import {
  addDays,
  addMonths,
  addMonthsToYearMonth,
  calendarDateInTimeZone,
  compareDates,
  dayOfWeek,
  formatCalendarDate,
  daysBetween,
  daysInMonth,
  fromDatabaseDate,
  fromDayNumber,
  fullyCoveredMonths,
  isCalendarDate,
  isLeapYear,
  isValidTimeZone,
  isWeekend,
  isWithin,
  lastDayOfMonth,
  monthsBetween,
  monthsInRange,
  parseCalendarDate,
  parseYearMonth,
  toDatabaseDate,
  toDayNumber,
  todayInTimeZone,
  yearMonthOf,
} from "./dates";

const d = parseCalendarDate;
const m = parseYearMonth;

describe("parsing and validation", () => {
  it("accepts real dates only", () => {
    expect(d("2026-02-28")).toBe("2026-02-28");
    expect(d("2028-02-29")).toBe("2028-02-29");
    expect(() => d("2026-02-29")).toThrow(RangeError);
    expect(() => d("2026-04-31")).toThrow(RangeError);
    expect(() => d("2026-13-01")).toThrow(RangeError);
  });

  it("requires the exact YYYY-MM-DD format and a sane year", () => {
    expect(isCalendarDate("2026-1-01")).toBe(false);
    expect(isCalendarDate("20260101")).toBe(false);
    expect(isCalendarDate("2026-01-01T00:00:00Z")).toBe(false);
    expect(isCalendarDate("1899-12-31")).toBe(false);
    expect(isCalendarDate("2026-10-25")).toBe(true);
  });

  it("knows leap years and month lengths", () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("validates month strings", () => {
    expect(m("2026-10")).toBe("2026-10");
    expect(() => m("2026-00")).toThrow(RangeError);
    expect(() => m("2026-1")).toThrow(RangeError);
  });
});

describe("day arithmetic", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
    expect(addDays(d("2028-03-01"), -1)).toBe("2028-02-29");
    expect(addDays(d("2026-01-01"), 365)).toBe("2027-01-01");
  });

  it("round-trips day numbers", () => {
    expect(toDayNumber(d("1970-01-01"))).toBe(0);
    expect(fromDayNumber(toDayNumber(d("2026-10-25")))).toBe("2026-10-25");
  });

  it("measures and compares", () => {
    expect(daysBetween(d("2026-01-01"), d("2026-12-31"))).toBe(364);
    expect(daysBetween(d("2026-12-31"), d("2026-01-01"))).toBe(-364);
    expect(compareDates(d("2026-01-02"), d("2026-01-10"))).toBe(-1);
    expect(compareDates(d("2026-01-10"), d("2026-01-10"))).toBe(0);
    expect(isWithin(d("2026-01-31"), d("2026-01-01"), d("2026-01-31"))).toBe(
      true,
    );
    expect(isWithin(d("2026-02-01"), d("2026-01-01"), d("2026-01-31"))).toBe(
      false,
    );
  });

  it("knows the day of the week", () => {
    expect(dayOfWeek(d("1970-01-01"))).toBe(4); // Thursday
    expect(dayOfWeek(d("2026-10-25"))).toBe(0); // Sunday
    expect(dayOfWeek(d("2024-02-29"))).toBe(4); // Thursday
    expect(isWeekend(d("2026-10-24"))).toBe(true);
    expect(isWeekend(d("2026-10-23"))).toBe(false);
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonths(d("2026-01-31"), 1)).toBe("2026-02-28");
    expect(addMonths(d("2028-01-31"), 1)).toBe("2028-02-29");
    expect(addMonths(d("2026-03-31"), -1)).toBe("2026-02-28");
    expect(addMonths(d("2026-05-31"), 1)).toBe("2026-06-30");
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths(d("2026-12-15"), 1)).toBe("2027-01-15");
    expect(addMonths(d("2026-01-15"), -13)).toBe("2024-12-15");
  });
});

describe("months", () => {
  it("derives and walks months", () => {
    expect(yearMonthOf(d("2026-10-25"))).toBe("2026-10");
    expect(lastDayOfMonth(m("2026-02"))).toBe("2026-02-28");
    expect(lastDayOfMonth(m("2028-02"))).toBe("2028-02-29");
    expect(addMonthsToYearMonth(m("2026-11"), 3)).toBe("2027-02");
    expect(addMonthsToYearMonth(m("2026-01"), -1)).toBe("2025-12");
    expect(addMonthsToYearMonth(m("2026-01"), -13)).toBe("2024-12");
    expect(monthsBetween(m("2025-11"), m("2026-02"))).toBe(3);
    expect(monthsInRange(m("2026-11"), m("2027-02"))).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsInRange(m("2027-02"), m("2026-11"))).toEqual([]);
  });

  it("keeps partial months out of fully covered months", () => {
    expect(fullyCoveredMonths(d("2026-01-15"), d("2026-04-30"))).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(fullyCoveredMonths(d("2026-01-01"), d("2026-01-30"))).toEqual([]);
    expect(fullyCoveredMonths(d("2026-01-01"), d("2026-01-31"))).toEqual([
      "2026-01",
    ]);
  });
});

describe("time zones", () => {
  it("resolves the user's calendar date for an instant", () => {
    const instant = new Date("2026-03-01T05:30:00Z");
    expect(calendarDateInTimeZone(instant, "UTC")).toBe("2026-03-01");
    expect(calendarDateInTimeZone(instant, "America/Chicago")).toBe(
      "2026-02-28",
    ); // 23:30 CST
    expect(
      calendarDateInTimeZone(new Date("2026-10-25T16:00:00Z"), "Asia/Tokyo"),
    ).toBe("2026-10-26");
  });

  it("handles daylight saving transitions", () => {
    // US daylight saving time ends 2026-11-01 at 2:00 CDT (07:00 UTC).
    expect(
      calendarDateInTimeZone(
        new Date("2026-11-01T05:30:00Z"),
        "America/Chicago",
      ),
    ).toBe("2026-11-01");
    expect(
      calendarDateInTimeZone(
        new Date("2026-11-01T04:30:00Z"),
        "America/Chicago",
      ),
    ).toBe("2026-10-31");
  });

  it("computes today for the user rather than the server", () => {
    const now = new Date("2026-10-26T03:59:59Z");
    expect(todayInTimeZone("America/New_York", now)).toBe("2026-10-25");
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-26");
  });

  it("rejects unknown zones and invalid instants", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(() =>
      calendarDateInTimeZone(new Date(), "Mars/Olympus_Mons"),
    ).toThrow(RangeError);
    expect(() => calendarDateInTimeZone(new Date("nope"), "UTC")).toThrow(
      RangeError,
    );
  });
});

describe("independence from the machine's time zone", () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTimeZone;
  });

  it("gives the same results when the process time zone changes", () => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    expect(addDays(d("2026-03-08"), 1)).toBe("2026-03-09");
    expect(addMonths(d("2026-01-31"), 1)).toBe("2026-02-28");
    expect(fromDatabaseDate(toDatabaseDate(d("2026-10-25")))).toBe(
      "2026-10-25",
    );
    process.env.TZ = "America/Adak"; // UTC-10/-9
    expect(dayOfWeek(d("2026-10-25"))).toBe(0);
    expect(fromDatabaseDate(new Date("2026-10-25T00:00:00Z"))).toBe(
      "2026-10-25",
    );
  });
});

describe("database boundary", () => {
  it("maps calendar dates to UTC-midnight Dates and back", () => {
    expect(toDatabaseDate(d("2026-10-25")).toISOString()).toBe(
      "2026-10-25T00:00:00.000Z",
    );
    expect(fromDatabaseDate(new Date("2028-02-29T00:00:00Z"))).toBe(
      "2028-02-29",
    );
    expect(() => fromDatabaseDate(new Date("nope"))).toThrow(RangeError);
  });
});

describe("formatCalendarDate", () => {
  it("formats the same calendar day in every time zone", () => {
    const date = parseCalendarDate("2026-01-01");
    const originalTimeZone = process.env.TZ;
    onTestFinished(() => {
      process.env.TZ = originalTimeZone;
    });
    for (const timeZone of [
      "UTC",
      "America/Los_Angeles",
      "Pacific/Kiritimati",
    ]) {
      process.env.TZ = timeZone;
      expect(formatCalendarDate(date)).toBe("Jan 1, 2026");
    }
    expect(formatCalendarDate(date, "long")).toBe("January 1, 2026");
  });
});
