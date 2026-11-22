import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  dateRange,
  dayMetrics,
  hhmmToMinutes,
  isWorkingDay,
  leaveWorkingDays,
  monthKeys,
  monthSummary,
  parseMonthParam,
  statusForLeave,
  type DayRecord,
} from "./attendance";

const ist = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00+05:30`);
const rec = (
  check_in: Date | null,
  check_out: Date | null,
  status: DayRecord["status"] = null,
): DayRecord => ({ check_in, check_out, status });

describe("hhmmToMinutes", () => {
  it("parses HH:mm", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("00:00")).toBe(0);
  });
  it("rejects anything else", () => {
    expect(() => hhmmToMinutes("9:30")).toThrow();
    expect(() => hhmmToMinutes("24:00")).toThrow();
  });
});

describe("dayMetrics", () => {
  const d = "2026-11-23"; // a Monday

  it("treats a check-in without a status as present and works out hours", () => {
    const m = dayMetrics(rec(ist(d, "09:00"), ist(d, "18:30")), DEFAULT_RULES);
    expect(m.status).toBe("present");
    expect(m.hours).toBe(9.5);
    expect(m.overtime).toBe(1.5);
    expect(m.lateMinutes).toBe(0);
    expect(m.earlyMinutes).toBe(0);
  });

  it("is not late within the grace period, and late after it", () => {
    expect(dayMetrics(rec(ist(d, "09:10"), null), DEFAULT_RULES).lateMinutes).toBe(0);
    expect(dayMetrics(rec(ist(d, "09:25"), null), DEFAULT_RULES).lateMinutes).toBe(25);
  });

  it("counts leaving early, except on a half day", () => {
    expect(dayMetrics(rec(ist(d, "09:00"), ist(d, "17:00")), DEFAULT_RULES).earlyMinutes).toBe(60);
    expect(
      dayMetrics(rec(ist(d, "09:00"), ist(d, "13:00"), "half_day"), DEFAULT_RULES).earlyMinutes,
    ).toBe(0);
  });

  it("has no hours without both times, or with check-out before check-in", () => {
    expect(dayMetrics(rec(ist(d, "09:00"), null), DEFAULT_RULES).hours).toBeNull();
    expect(dayMetrics(rec(ist(d, "18:00"), ist(d, "09:00")), DEFAULT_RULES).hours).toBeNull();
  });

  it("keeps an explicit status and has no status without anything", () => {
    expect(dayMetrics(rec(null, null, "sick_leave"), DEFAULT_RULES).status).toBe("sick_leave");
    expect(dayMetrics(rec(null, null), DEFAULT_RULES).status).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("lists a month's days", () => {
    const nov = monthKeys(2026, 11);
    expect(nov).toHaveLength(30);
    expect(nov[0]).toBe("2026-11-01");
    expect(nov.at(-1)).toBe("2026-11-30");
    expect(monthKeys(2028, 2)).toHaveLength(29);
  });

  it("knows weekly offs and holidays", () => {
    const holidays = new Set(["2026-12-25"]);
    expect(isWorkingDay("2026-11-22", [0], holidays)).toBe(false); // Sunday
    expect(isWorkingDay("2026-11-23", [0], holidays)).toBe(true);
    expect(isWorkingDay("2026-12-25", [0], holidays)).toBe(false);
  });

  it("skips weekly offs and holidays in a leave", () => {
    // Fri 20 Nov .. Tue 24 Nov, Sunday off, Monday a holiday.
    expect(leaveWorkingDays("2026-11-20", "2026-11-24", [0], new Set(["2026-11-23"]))).toEqual([
      "2026-11-20",
      "2026-11-21",
      "2026-11-24",
    ]);
    expect(dateRange("2026-11-24", "2026-11-20")).toEqual([]);
  });

  it("parses a month parameter", () => {
    expect(parseMonthParam("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
  });

  it("maps leave types to statuses", () => {
    expect(statusForLeave("sick", false)).toBe("sick_leave");
    expect(statusForLeave("casual", true)).toBe("half_day");
    expect(statusForLeave("other", false)).toBe("other_leave");
  });
});

describe("monthSummary", () => {
  // Week of Mon 2 Nov – Sun 8 Nov 2026, viewed on Sat 7 Nov.
  const keys = monthKeys(2026, 11);
  const today = "2026-11-07";

  it("follows the workbook: P/OD/WFH = 1, HD = 0.5, paid leave outside the denominator, gaps are missing", () => {
    const records = new Map<string, DayRecord>([
      ["2026-11-02", rec(ist("2026-11-02", "09:00"), ist("2026-11-02", "18:00"))], // P, 9h
      ["2026-11-03", rec(ist("2026-11-03", "09:30"), ist("2026-11-03", "18:00"))], // P, late
      ["2026-11-04", rec(null, null, "half_day")],
      ["2026-11-05", rec(null, null, "sick_leave")],
      ["2026-11-06", rec(null, null, "absent")],
      // 7 Nov (Saturday, a working day): no record -> missing
      ["2026-11-01", rec(null, null, "weekly_off")], // Sunday
      ["2026-11-10", rec(null, null, "absent")], // after today: ignored
    ]);
    const s = monthSummary(keys, records, DEFAULT_RULES, new Set(), today);

    expect(s.present).toBe(2);
    expect(s.halfDays).toBe(1);
    expect(s.paidLeave).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.lateDays).toBe(1);
    expect(s.totalHours).toBe(17.5);
    expect(s.overtime).toBe(1.5); // 9h and 8.5h days
    expect(s.presentEquivalent).toBe(2.5);
    // Mon–Sat working days (6), minus one paid leave.
    expect(s.scheduled).toBe(5);
    expect(s.percent).toBeCloseTo(0.5);
  });

  it("has no percentage before anything is scheduled", () => {
    const s = monthSummary(keys, new Map(), DEFAULT_RULES, new Set(), "2026-10-31");
    expect(s.scheduled).toBe(0);
    expect(s.percent).toBeNull();
  });

  it("counts work on a day off without exceeding 100%", () => {
    const records = new Map<string, DayRecord>([
      ["2026-11-02", rec(null, null, "present")],
      ["2026-11-08", rec(null, null, "present")], // Sunday
    ]);
    const s = monthSummary(keys, records, DEFAULT_RULES, new Set(), "2026-11-02");
    expect(s.percent).toBe(1);
    const later = monthSummary(keys, records, DEFAULT_RULES, new Set(), "2026-11-08");
    expect(later.presentEquivalent).toBe(2);
    expect(later.percent).toBeLessThanOrEqual(1);
  });
});
