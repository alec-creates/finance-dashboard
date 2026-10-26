import { describe, expect, it } from "vitest";

import { currentMonth, parseTimeZone, resolveTimeZone } from "./time-zone";

describe("currentMonth at month boundaries", () => {
  // 03:00 UTC on Nov 1: still October to the west of UTC.
  const earlyNovemberUtc = new Date("2026-11-01T03:00:00Z");
  // 16:00 UTC on Oct 31: already November to the east of UTC.
  const lateOctoberUtc = new Date("2026-10-31T16:00:00Z");

  it("uses the local month for negative UTC offsets", () => {
    expect(currentMonth("America/Los_Angeles", earlyNovemberUtc)).toBe(
      "2026-10",
    ); // UTC-7
    expect(currentMonth("America/New_York", earlyNovemberUtc)).toBe("2026-10"); // UTC-4
    expect(currentMonth("UTC", earlyNovemberUtc)).toBe("2026-11");
  });

  it("uses the local month for positive UTC offsets", () => {
    expect(currentMonth("Asia/Tokyo", lateOctoberUtc)).toBe("2026-11"); // UTC+9
    expect(currentMonth("Pacific/Kiritimati", lateOctoberUtc)).toBe("2026-11"); // UTC+14
    expect(currentMonth("UTC", lateOctoberUtc)).toBe("2026-10");
  });

  it("handles half-hour offsets and the year boundary", () => {
    const newYearUtc = new Date("2026-12-31T19:00:00Z");
    expect(currentMonth("Asia/Kolkata", newYearUtc)).toBe("2027-01"); // UTC+5:30
    expect(
      currentMonth("America/St_Johns", new Date("2027-01-01T02:00:00Z")),
    ).toBe("2026-12"); // UTC-3:30
  });

  it("follows daylight saving changes", () => {
    // New York is UTC-4 in summer and UTC-5 in winter.
    expect(
      currentMonth("America/New_York", new Date("2026-08-01T03:30:00Z")),
    ).toBe("2026-07");
    expect(
      currentMonth("America/New_York", new Date("2026-12-01T04:30:00Z")),
    ).toBe("2026-11");
    expect(
      currentMonth("America/New_York", new Date("2026-12-01T05:30:00Z")),
    ).toBe("2026-12");
  });
});

describe("resolveTimeZone", () => {
  it("prefers a saved setting, then the browser's zone, then UTC", () => {
    expect(resolveTimeZone("Europe/Berlin", "Asia/Tokyo")).toBe(
      "Europe/Berlin",
    );
    expect(resolveTimeZone(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(resolveTimeZone(undefined, undefined)).toBe("UTC");
  });

  it("ignores invalid or oversized values instead of failing", () => {
    expect(resolveTimeZone("Not/AZone", "Mars/Olympus_Mons")).toBe("UTC");
    expect(parseTimeZone("x".repeat(65))).toBeNull();
    expect(parseTimeZone("")).toBeNull();
    expect(parseTimeZone("America/Chicago")).toBe("America/Chicago");
  });
});
