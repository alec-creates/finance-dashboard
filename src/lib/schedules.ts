import {
  addDays,
  addMonths,
  calendarDate,
  daysBetween,
  daysInYearMonth,
  dayOfWeek,
  firstDayOfMonth,
  isCalendarDate,
  isWithin,
  lastDayOfMonth,
  monthsBetween,
  monthsInRange,
  toDayNumber,
  fromDayNumber,
  yearMonthOf,
  yearMonthParts,
  type CalendarDate,
  type YearMonth,
} from "./dates";

/**
 * Recurring schedules shared by pay dates, investment contributions and bills (ADR-0006). Occurrences are calendar
 * dates computed on demand; schedules extend both before and after their anchor date.
 */

/** 1-31, or "last" for the last day of the month. Days past the end of a short month clamp to its last day. */
export type DayOfMonth = number | "last";

/** Moves an occurrence that falls on a weekend. Bank holidays are not modelled. */
export type WeekendAdjustment =
  "none" | "previousBusinessDay" | "nextBusinessDay";

interface ScheduleOptions {
  weekendAdjustment?: WeekendAdjustment;
}

export type Schedule = ScheduleOptions &
  (
    | { frequency: "weekly"; anchorDate: CalendarDate }
    | { frequency: "biweekly"; anchorDate: CalendarDate }
    | {
        frequency: "semimonthly";
        daysOfMonth: readonly [DayOfMonth, DayOfMonth];
      }
    | { frequency: "monthly"; dayOfMonth: DayOfMonth }
    | {
        frequency: "everyNDays";
        anchorDate: CalendarDate;
        intervalDays: number;
      }
    | {
        frequency: "everyNMonths";
        anchorDate: CalendarDate;
        intervalMonths: number;
      }
  );

export type ScheduleFrequency = Schedule["frequency"];

export type ScheduleValidation = { ok: true } | { ok: false; errors: string[] };

const MAX_INTERVAL_DAYS = 3660;
const MAX_INTERVAL_MONTHS = 120;
const MAX_RANGE_DAYS = 366 * 100;
// Weekend adjustment moves a date by at most two days, so raw occurrences are generated slightly beyond the range.
const ADJUSTMENT_MARGIN_DAYS = 3;
const SEARCH_WINDOW_DAYS = 400;
const SEARCH_WINDOWS = 12; // enough to cover the longest allowed interval

const WEEKEND_ADJUSTMENTS: readonly WeekendAdjustment[] = [
  "none",
  "previousBusinessDay",
  "nextBusinessDay",
];

function isDayOfMonth(value: unknown): value is DayOfMonth {
  return (
    value === "last" ||
    (Number.isInteger(value) &&
      (value as number) >= 1 &&
      (value as number) <= 31)
  );
}

function dayOfMonthOrder(value: DayOfMonth): number {
  return value === "last" ? 32 : value;
}

/** Validates a schedule, typically one loaded from JSON. Returns every problem found. */
export function validateSchedule(schedule: Schedule): ScheduleValidation {
  const errors: string[] = [];
  const anchorDate = "anchorDate" in schedule ? schedule.anchorDate : undefined;

  switch (schedule.frequency) {
    case "weekly":
    case "biweekly":
      break;
    case "everyNDays":
      if (
        !Number.isInteger(schedule.intervalDays) ||
        schedule.intervalDays < 1 ||
        schedule.intervalDays > MAX_INTERVAL_DAYS
      ) {
        errors.push(
          `intervalDays must be an integer from 1 to ${MAX_INTERVAL_DAYS}`,
        );
      }
      break;
    case "everyNMonths":
      if (
        !Number.isInteger(schedule.intervalMonths) ||
        schedule.intervalMonths < 1 ||
        schedule.intervalMonths > MAX_INTERVAL_MONTHS
      ) {
        errors.push(
          `intervalMonths must be an integer from 1 to ${MAX_INTERVAL_MONTHS}`,
        );
      }
      break;
    case "monthly":
      if (!isDayOfMonth(schedule.dayOfMonth)) {
        errors.push('dayOfMonth must be 1-31 or "last"');
      }
      break;
    case "semimonthly": {
      const days = schedule.daysOfMonth as unknown;
      if (
        !Array.isArray(days) ||
        days.length !== 2 ||
        !days.every(isDayOfMonth)
      ) {
        errors.push('daysOfMonth must be two values, each 1-31 or "last"');
      } else if (
        dayOfMonthOrder(days[0] as DayOfMonth) >=
        dayOfMonthOrder(days[1] as DayOfMonth)
      ) {
        errors.push("daysOfMonth must be in increasing order");
      }
      break;
    }
    default:
      errors.push("Unknown schedule frequency");
  }

  if (
    "anchorDate" in schedule &&
    (typeof anchorDate !== "string" || !isCalendarDate(anchorDate))
  ) {
    errors.push("anchorDate must be a valid YYYY-MM-DD date");
  }
  if (
    schedule.weekendAdjustment !== undefined &&
    !WEEKEND_ADJUSTMENTS.includes(schedule.weekendAdjustment)
  ) {
    errors.push("weekendAdjustment is not recognized");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function assertValidSchedule(schedule: Schedule): void {
  const result = validateSchedule(schedule);
  if (!result.ok) {
    throw new RangeError(`Invalid schedule: ${result.errors.join("; ")}`);
  }
}

function resolveDayOfMonth(month: YearMonth, day: DayOfMonth): CalendarDate {
  if (day === "last") {
    return lastDayOfMonth(month);
  }
  const { year, month: monthNumber } = yearMonthParts(month);
  return calendarDate(year, monthNumber, Math.min(day, daysInYearMonth(month)));
}

function adjustForWeekend(
  date: CalendarDate,
  adjustment: WeekendAdjustment,
): CalendarDate {
  const weekday = dayOfWeek(date);
  if (adjustment === "none" || (weekday !== 0 && weekday !== 6)) {
    return date;
  }
  if (adjustment === "previousBusinessDay") {
    return addDays(date, weekday === 6 ? -1 : -2);
  }
  return addDays(date, weekday === 6 ? 2 : 1);
}

function everyNDays(
  anchor: CalendarDate,
  interval: number,
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate[] {
  const anchorDay = toDayNumber(anchor);
  const lastDay = toDayNumber(to);
  const dates: CalendarDate[] = [];
  for (
    let step = Math.ceil((toDayNumber(from) - anchorDay) / interval);
    anchorDay + step * interval <= lastDay;
    step += 1
  ) {
    dates.push(fromDayNumber(anchorDay + step * interval));
  }
  return dates;
}

/** Occurrences before weekend adjustment, covering at least [from, to]. */
function rawOccurrences(
  schedule: Schedule,
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate[] {
  const months = monthsInRange(yearMonthOf(from), yearMonthOf(to));
  switch (schedule.frequency) {
    case "weekly":
      return everyNDays(schedule.anchorDate, 7, from, to);
    case "biweekly":
      return everyNDays(schedule.anchorDate, 14, from, to);
    case "everyNDays":
      return everyNDays(schedule.anchorDate, schedule.intervalDays, from, to);
    case "monthly":
      return months.map((month) =>
        resolveDayOfMonth(month, schedule.dayOfMonth),
      );
    case "semimonthly":
      return months.flatMap((month) =>
        schedule.daysOfMonth.map((day) => resolveDayOfMonth(month, day)),
      );
    case "everyNMonths": {
      const anchorMonth = yearMonthOf(schedule.anchorDate);
      const interval = schedule.intervalMonths;
      return months
        .map((month) => monthsBetween(anchorMonth, month))
        .filter((offset) => ((offset % interval) + interval) % interval === 0)
        .map((offset) => addMonths(schedule.anchorDate, offset));
    }
  }
}

/**
 * All occurrences from `start` to `end`, inclusive, after weekend adjustment: sorted and without duplicates (e.g. a
 * semimonthly schedule on the 30th and the last day has one occurrence in February).
 */
export function occurrencesBetween(
  schedule: Schedule,
  start: CalendarDate,
  end: CalendarDate,
): CalendarDate[] {
  assertValidSchedule(schedule);
  if (start > end) {
    return [];
  }
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    throw new RangeError("Date range is too long");
  }
  const adjustment = schedule.weekendAdjustment ?? "none";
  const dates = rawOccurrences(
    schedule,
    addDays(start, -ADJUSTMENT_MARGIN_DAYS),
    addDays(end, ADJUSTMENT_MARGIN_DAYS),
  )
    .map((date) => adjustForWeekend(date, adjustment))
    .filter((date) => isWithin(date, start, end));
  return [...new Set(dates)].sort();
}

/** The first occurrence on or after `date`. */
export function nextOccurrence(
  schedule: Schedule,
  date: CalendarDate,
): CalendarDate {
  for (let window = 0; window < SEARCH_WINDOWS; window += 1) {
    const windowStart = addDays(date, window * SEARCH_WINDOW_DAYS);
    const found = occurrencesBetween(
      schedule,
      windowStart,
      addDays(windowStart, SEARCH_WINDOW_DAYS - 1),
    )[0];
    if (found) {
      return found;
    }
  }
  throw new RangeError("No occurrence found");
}

/** The last occurrence on or before `date`. */
export function previousOccurrence(
  schedule: Schedule,
  date: CalendarDate,
): CalendarDate {
  for (let window = 0; window < SEARCH_WINDOWS; window += 1) {
    const windowEnd = addDays(date, -window * SEARCH_WINDOW_DAYS);
    const found = occurrencesBetween(
      schedule,
      addDays(windowEnd, -(SEARCH_WINDOW_DAYS - 1)),
      windowEnd,
    ).at(-1);
    if (found) {
      return found;
    }
  }
  throw new RangeError("No occurrence found");
}

/** The occurrences that fall in a calendar month (e.g. three paydays in some months of a biweekly schedule). */
export function occurrencesInMonth(
  schedule: Schedule,
  month: YearMonth,
): CalendarDate[] {
  return occurrencesBetween(
    schedule,
    firstDayOfMonth(month),
    lastDayOfMonth(month),
  );
}
