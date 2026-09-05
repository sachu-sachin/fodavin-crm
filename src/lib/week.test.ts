import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  currentWeekStart,
  normaliseWeekParam,
  startOfWeek,
  weekDays,
  weekRangeLabel,
} from "./week";

describe("addDays", () => {
  it("adds positive days, including across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("subtracts negative days, including across a year boundary", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("returns the same key when adding zero", () => {
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
  });
});

describe("startOfWeek", () => {
  it("returns the same date when it's already a Monday", () => {
    expect(startOfWeek("2026-01-05")).toBe("2026-01-05"); // a Monday
  });

  it("rolls a Sunday back to the preceding Monday", () => {
    expect(startOfWeek("2026-01-11")).toBe("2026-01-05"); // Sunday
  });

  it("rolls a mid-week day back to Monday", () => {
    expect(startOfWeek("2026-01-08")).toBe("2026-01-05"); // Thursday
  });
});

describe("currentWeekStart", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the Monday of the current IST week", () => {
    vi.useFakeTimers();
    // 2026-01-08 is a Thursday in IST.
    vi.setSystemTime(new Date("2026-01-08T06:00:00Z")); // 11:30 IST
    expect(currentWeekStart()).toBe("2026-01-05");
  });
});

describe("weekDays", () => {
  const days = weekDays("2026-01-05"); // Monday

  it("returns 7 days starting Monday", () => {
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.label)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
    expect(days.map((d) => d.key)).toEqual([
      "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08",
      "2026-01-09", "2026-01-10", "2026-01-11",
    ]);
  });

  it("flags Saturday and Sunday (only) as weekend", () => {
    expect(days.map((d) => d.isWeekend)).toEqual([
      false, false, false, false, false, true, true,
    ]);
  });

  it("computes the correct day-of-month for each day", () => {
    expect(days.map((d) => d.dayOfMonth)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("weekRangeLabel", () => {
  it("formats a range within one month", () => {
    expect(weekRangeLabel("2026-01-05")).toBe("5–11 Jan 2026");
  });

  it("formats a range that crosses a month boundary within the same year", () => {
    expect(weekRangeLabel("2026-01-26")).toBe("26 Jan – 1 Feb 2026");
  });

  it("formats a range that crosses a year boundary", () => {
    expect(weekRangeLabel("2025-12-29")).toBe("29 Dec 2025 – 4 Jan 2026");
  });
});

describe("normaliseWeekParam", () => {
  afterEach(() => vi.useRealTimers());

  it("falls back to the current week for an undefined param", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T06:00:00Z"));
    expect(normaliseWeekParam(undefined)).toBe(currentWeekStart());
  });

  it("falls back to the current week for a malformed param", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T06:00:00Z"));
    expect(normaliseWeekParam("not-a-date")).toBe(currentWeekStart());
    expect(normaliseWeekParam("2026/01/08")).toBe(currentWeekStart());
  });

  it("normalises a valid non-Monday date to that week's Monday", () => {
    expect(normaliseWeekParam("2026-01-08")).toBe("2026-01-05");
  });

  it("passes a valid Monday through unchanged", () => {
    expect(normaliseWeekParam("2026-01-05")).toBe("2026-01-05");
  });
});
