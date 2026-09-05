// Week arithmetic for the timesheet, done entirely on "YYYY-MM-DD" date keys.
//
// Keys are manipulated through UTC so the maths can never drift across a
// timezone boundary; the keys themselves are produced from IST by
// `istDateKey`/`istToday`, so a "day" is always an IST day. Mixing the two
// (e.g. using local Date methods) is what causes off-by-one week bugs.

import { istToday } from "@/lib/format";

export const DAYS_IN_WEEK = 7;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toUTC(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const d = toUTC(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** Monday of the week containing `dateKey`. */
export function startOfWeek(dateKey: string): string {
  const d = toUTC(dateKey);
  // getUTCDay: 0=Sun … 6=Sat. Shift so Monday is 0.
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(dateKey, -offset);
}

/** The current week's Monday, in IST. */
export function currentWeekStart(): string {
  return startOfWeek(istToday());
}

export interface WeekDay {
  key: string;
  label: string;
  dayOfMonth: number;
  isWeekend: boolean;
}

/** The seven days of the week beginning at `weekStart` (a Monday). */
export function weekDays(weekStart: string): WeekDay[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
    const key = addDays(weekStart, i);
    return {
      key,
      label: DAY_LABELS[i],
      dayOfMonth: toUTC(key).getUTCDate(),
      isWeekend: i >= 5,
    };
  });
}

/** "6–12 Jan 2026" style label for a week. */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, DAYS_IN_WEEK - 1);
  const start = toUTC(weekStart);
  const finish = toUTC(end);

  const month = (d: Date) =>
    d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  const year = (d: Date) => d.getUTCFullYear();

  if (month(start) === month(finish) && year(start) === year(finish)) {
    return `${start.getUTCDate()}–${finish.getUTCDate()} ${month(finish)} ${year(finish)}`;
  }
  if (year(start) === year(finish)) {
    return `${start.getUTCDate()} ${month(start)} – ${finish.getUTCDate()} ${month(finish)} ${year(finish)}`;
  }
  return `${start.getUTCDate()} ${month(start)} ${year(start)} – ${finish.getUTCDate()} ${month(finish)} ${year(finish)}`;
}

/** Validate a `?week=` param, falling back to the current week. */
export function normaliseWeekParam(raw: string | undefined): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return currentWeekStart();
  const d = toUTC(raw);
  if (Number.isNaN(d.getTime())) return currentWeekStart();
  return startOfWeek(raw);
}
