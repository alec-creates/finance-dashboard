/**
 * Which time zone decides "today" and "this month" for the owner. Only the default view uses it: stored transaction
 * dates are calendar dates and are never shifted.
 *
 * Until a time zone setting exists, the browser reports its own zone in a cookie (`TIME_ZONE_COOKIE`), and the server
 * renders with it, so the page and its hydration agree. A saved setting wins; anything invalid falls back to UTC.
 */
import {
  isValidTimeZone,
  todayInTimeZone,
  yearMonthOf,
  type YearMonth,
} from "./dates";

export const TIME_ZONE_COOKIE = "finance.tz";

const MAX_ZONE_LENGTH = 64;

/** A cookie value as a usable IANA zone, or null (missing, too long, or unknown). */
export function parseTimeZone(value: string | null | undefined): string | null {
  if (!value || value.length > MAX_ZONE_LENGTH) {
    return null;
  }
  return isValidTimeZone(value) ? value : null;
}

/** Saved setting first, then the browser's zone, then UTC. */
export function resolveTimeZone(
  saved: string | null | undefined,
  browser: string | null | undefined,
): string {
  return parseTimeZone(saved) ?? parseTimeZone(browser) ?? "UTC";
}

/** The calendar month it currently is for someone in `timeZone`. */
export function currentMonth(
  timeZone: string,
  now: Date = new Date(),
): YearMonth {
  return yearMonthOf(todayInTimeZone(timeZone, now));
}
