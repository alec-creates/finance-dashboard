/**
 * Calendar dates ("2026-10-25") and months ("2026-10") as validated strings. Transactions, paydays and budgets are
 * calendar dates, not instants, so this module never uses the machine's local time zone. Converting a real instant
 * to a calendar date always names a time zone explicitly (the user's setting).
 */

export type CalendarDate = string & { readonly __brand: "CalendarDate" };
export type YearMonth = string & { readonly __brand: "YearMonth" };

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const MS_PER_DAY = 86_400_000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  assertYearMonthParts(year, month);
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function assertYearMonthParts(year: number, month: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be between 1 and 12");
  }
}

const pad2 = (value: number) => String(value).padStart(2, "0");

export function calendarDate(
  year: number,
  month: number,
  day: number,
): CalendarDate {
  assertYearMonthParts(year, month);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("Day is not valid for that month");
  }
  return `${year}-${pad2(month)}-${pad2(day)}` as CalendarDate;
}

export function isCalendarDate(value: string): value is CalendarDate {
  try {
    parseCalendarDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Validates a "YYYY-MM-DD" string, including that the day exists (no 2026-02-30). */
export function parseCalendarDate(value: string): CalendarDate {
  const match = CALENDAR_DATE.exec(value);
  if (!match) {
    throw new RangeError("Dates must use the YYYY-MM-DD format");
  }
  return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function dateParts(date: CalendarDate): DateParts {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

/** Days since 1970-01-01. */
export function toDayNumber(date: CalendarDate): number {
  const { year, month, day } = dateParts(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromDayNumber(dayNumber: number): CalendarDate {
  if (!Number.isSafeInteger(dayNumber)) {
    throw new RangeError("Day number must be an integer");
  }
  const instant = new Date(dayNumber * MS_PER_DAY);
  return calendarDate(
    instant.getUTCFullYear(),
    instant.getUTCMonth() + 1,
    instant.getUTCDate(),
  );
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Adds calendar months, clamping to the last day of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  if (!Number.isInteger(months)) {
    throw new RangeError("Months must be an integer");
  }
  const { year, month, day } = dateParts(date);
  const target = addMonthsToYearMonth(yearMonth(year, month), months);
  const { year: targetYear, month: targetMonth } = yearMonthParts(target);
  return calendarDate(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  // ISO dates with four-digit years sort correctly as strings.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive on both ends. */
export function isWithin(
  date: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): boolean {
  return date >= start && date <= end;
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: CalendarDate): number {
  // 1970-01-01 was a Thursday (4).
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

export function isWeekend(date: CalendarDate): boolean {
  const weekday = dayOfWeek(date);
  return weekday === 0 || weekday === 6;
}

// ---------------------------------------------------------------------------------------------------------------
// Months (calendar-month budgeting)

export function yearMonth(year: number, month: number): YearMonth {
  assertYearMonthParts(year, month);
  return `${year}-${pad2(month)}` as YearMonth;
}

export function parseYearMonth(value: string): YearMonth {
  const match = YEAR_MONTH.exec(value);
  if (!match) {
    throw new RangeError("Months must use the YYYY-MM format");
  }
  return yearMonth(Number(match[1]), Number(match[2]));
}

export function yearMonthParts(value: YearMonth): {
  year: number;
  month: number;
} {
  const [year, month] = value.split("-").map(Number) as [number, number];
  return { year, month };
}

export function yearMonthOf(date: CalendarDate): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

export function firstDayOfMonth(month: YearMonth): CalendarDate {
  return `${month}-01` as CalendarDate;
}

export function lastDayOfMonth(month: YearMonth): CalendarDate {
  const { year, month: monthNumber } = yearMonthParts(month);
  return calendarDate(year, monthNumber, daysInMonth(year, monthNumber));
}

export function daysInYearMonth(month: YearMonth): number {
  const { year, month: monthNumber } = yearMonthParts(month);
  return daysInMonth(year, monthNumber);
}

export function addMonthsToYearMonth(
  month: YearMonth,
  months: number,
): YearMonth {
  if (!Number.isInteger(months)) {
    throw new RangeError("Months must be an integer");
  }
  const { year, month: monthNumber } = yearMonthParts(month);
  const index = year * 12 + (monthNumber - 1) + months;
  return yearMonth(Math.floor(index / 12), (index % 12) + 1);
}

/** Months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  const a = yearMonthParts(from);
  const b = yearMonthParts(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Every month from `start` to `end`, inclusive. Empty when `start` is after `end`. */
export function monthsInRange(start: YearMonth, end: YearMonth): YearMonth[] {
  const count = monthsBetween(start, end);
  return Array.from({ length: Math.max(0, count + 1) }, (_, offset) =>
    addMonthsToYearMonth(start, offset),
  );
}

/**
 * Months entirely covered by a data range (both ends inclusive). Used to keep partial months, such as the current
 * month or the month an import starts in, out of monthly averages.
 */
export function fullyCoveredMonths(
  rangeStart: CalendarDate,
  rangeEnd: CalendarDate,
): YearMonth[] {
  return monthsInRange(yearMonthOf(rangeStart), yearMonthOf(rangeEnd)).filter(
    (month) =>
      firstDayOfMonth(month) >= rangeStart && lastDayOfMonth(month) <= rangeEnd,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Time zones

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      calendar: "gregory",
      numberingSystem: "latn",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The calendar date an instant falls on in an IANA time zone (e.g. "America/Chicago"). */
export function calendarDateInTimeZone(
  instant: Date,
  timeZone: string,
): CalendarDate {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid instant");
  }
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError("Unknown time zone");
  }
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return calendarDate(part("year"), part("month"), part("day"));
}

/** Today's date for the user, which can differ from the server's UTC date near midnight. */
export function todayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): CalendarDate {
  return calendarDateInTimeZone(now, timeZone);
}

// ---------------------------------------------------------------------------------------------------------------
// Database boundary: Postgres DATE columns come back from Prisma as JS Dates at UTC midnight.

export function toDatabaseDate(date: CalendarDate): Date {
  return new Date(toDayNumber(date) * MS_PER_DAY);
}

export function fromDatabaseDate(value: Date): CalendarDate {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Invalid date");
  }
  return calendarDate(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}
