// Attendance rules: per-day metrics (hours, late, early, overtime) and the
// monthly summary. Pure functions on plain values, no database access.
//
// They follow the attendance workbook the team used before this module:
// P / OD / WFH count as a full day, HD as half, paid leave is left out of the
// denominator, and a working day with no record is reported as "missing"
// rather than silently counted as absent.

import { addDays } from "@/lib/week";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "half_day",
  "work_from_home",
  "on_duty",
  "weekly_off",
  "holiday",
  "casual_leave",
  "sick_leave",
  "earned_leave",
  "unpaid_leave",
  "comp_off",
  "other_leave",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_TYPES = [
  "casual",
  "sick",
  "earned",
  "unpaid",
  "comp_off",
  "other",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

type Bucket =
  | "present"
  | "absent"
  | "half_day"
  | "remote"
  | "on_duty"
  | "off"
  | "paid_leave"
  | "unpaid_leave";

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; code: string; weight: number; bucket: Bucket }
> = {
  present: { label: "Present", code: "P", weight: 1, bucket: "present" },
  absent: { label: "Absent", code: "A", weight: 0, bucket: "absent" },
  half_day: { label: "Half day", code: "HD", weight: 0.5, bucket: "half_day" },
  work_from_home: { label: "Work from home", code: "WFH", weight: 1, bucket: "remote" },
  on_duty: { label: "On duty", code: "OD", weight: 1, bucket: "on_duty" },
  weekly_off: { label: "Weekly off", code: "WO", weight: 0, bucket: "off" },
  holiday: { label: "Holiday", code: "H", weight: 0, bucket: "off" },
  casual_leave: { label: "Casual leave", code: "CL", weight: 0, bucket: "paid_leave" },
  sick_leave: { label: "Sick leave", code: "SL", weight: 0, bucket: "paid_leave" },
  earned_leave: { label: "Earned leave", code: "EL", weight: 0, bucket: "paid_leave" },
  unpaid_leave: { label: "Leave without pay", code: "LWP", weight: 0, bucket: "unpaid_leave" },
  comp_off: { label: "Comp off", code: "CO", weight: 0, bucket: "paid_leave" },
  other_leave: { label: "Other leave", code: "OL", weight: 0, bucket: "paid_leave" },
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: "Casual leave",
  sick: "Sick leave",
  earned: "Earned leave",
  unpaid: "Leave without pay",
  comp_off: "Comp off",
  other: "Other",
};

/** The attendance status an approved leave writes on each of its days. */
export function statusForLeave(type: LeaveType, halfDay: boolean): AttendanceStatus {
  if (halfDay) return "half_day";
  switch (type) {
    case "casual":
      return "casual_leave";
    case "sick":
      return "sick_leave";
    case "earned":
      return "earned_leave";
    case "unpaid":
      return "unpaid_leave";
    case "comp_off":
      return "comp_off";
    default:
      return "other_leave";
  }
}

export function isAttendanceStatus(v: string): v is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(v);
}

export function isLeaveType(v: string): v is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(v);
}

// -- Settings -----------------------------------------------------------------

export interface WorkRules {
  /** "HH:mm" IST */
  shiftStart: string;
  shiftEnd: string;
  lateGraceMinutes: number;
  standardHours: number;
  /** 0 = Sunday … 6 = Saturday */
  weeklyOffs: number[];
  /** Daily meetings, "HH:mm" IST: morning plan after the first, EOD report after the second. */
  morningMeeting: string;
  eodMeeting: string;
  /** Calls a Business Executive aims for each day. */
  dailyCallTarget: number;
}

/** Defaults from the old workbook's settings sheet. */
export const DEFAULT_RULES: WorkRules = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  lateGraceMinutes: 10,
  standardHours: 8,
  weeklyOffs: [0],
  morningMeeting: "09:30",
  eodMeeting: "17:30",
  dailyCallTarget: 60,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHmm(v: string): boolean {
  return HHMM.test(v);
}

/** "09:30" -> 570 (minutes after midnight). */
export function hhmmToMinutes(v: string): number {
  const m = HHMM.exec(v);
  if (!m) throw new Error(`Not a HH:mm time: ${v}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const istParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Minutes after IST midnight for an instant. */
export function istMinutesOfDay(d: Date): number {
  const parts = istParts.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** An instant's IST wall time as "HH:mm" (for <input type="time">). */
export function istHHmm(d: Date | null | undefined): string {
  if (!d) return "";
  const m = istMinutesOfDay(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// -- One day ------------------------------------------------------------------

export interface DayRecord {
  check_in: Date | null;
  check_out: Date | null;
  status: AttendanceStatus | null;
}

export interface DayMetrics {
  /** The stored status, or present when someone checked in without one. */
  status: AttendanceStatus | null;
  hours: number | null;
  overtime: number | null;
  /** Minutes after shift start, only once past the grace period. */
  lateMinutes: number;
  /** Minutes before shift end. */
  earlyMinutes: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function dayMetrics(r: DayRecord, rules: WorkRules): DayMetrics {
  const status = r.status ?? (r.check_in ? "present" : null);

  let hours: number | null = null;
  if (r.check_in && r.check_out && r.check_out > r.check_in) {
    hours = round2((r.check_out.getTime() - r.check_in.getTime()) / 3_600_000);
  }

  let lateMinutes = 0;
  if (r.check_in) {
    const late = istMinutesOfDay(r.check_in) - hhmmToMinutes(rules.shiftStart);
    if (late > rules.lateGraceMinutes) lateMinutes = late;
  }

  let earlyMinutes = 0;
  if (r.check_out && status !== "half_day") {
    earlyMinutes = Math.max(0, hhmmToMinutes(rules.shiftEnd) - istMinutesOfDay(r.check_out));
  }

  return {
    status,
    hours,
    overtime: hours == null ? null : round2(Math.max(0, hours - rules.standardHours)),
    lateMinutes,
    earlyMinutes,
  };
}

// -- Calendar -----------------------------------------------------------------

/** Day of week for a "YYYY-MM-DD" key, 0 = Sunday. */
export function dayOfWeek(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function isWorkingDay(
  key: string,
  weeklyOffs: readonly number[],
  holidays: ReadonlySet<string>,
): boolean {
  return !weeklyOffs.includes(dayOfWeek(key)) && !holidays.has(key);
}

/** Every date key from start to end inclusive (empty if end < start). */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end && out.length < 400; k = addDays(k, 1)) out.push(k);
  return out;
}

/** All date keys of a month (month is 1–12). */
export function monthKeys(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return dateRange(first, last);
}

/** "2026-11" -> { year, month } or null. */
export function parseMonthParam(v: string | undefined): { year: number; month: number } | null {
  const m = v ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v) : null;
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

// -- Month summary ------------------------------------------------------------

export interface MonthSummary {
  present: number;
  absent: number;
  halfDays: number;
  remote: number;
  onDuty: number;
  paidLeave: number;
  unpaidLeave: number;
  /** Working days up to today with no status and no check-in. */
  missing: number;
  lateDays: number;
  totalHours: number;
  overtime: number;
  /** P + OD + WFH + 0.5 × HD */
  presentEquivalent: number;
  /** Working days so far, less paid leave (the workbook's denominator). */
  scheduled: number;
  /** 0–1, or null when nothing was scheduled yet. */
  percent: number | null;
}

/**
 * Summarise one person's month. `records` is keyed by date; only days up to
 * and including `today` count, so a month in progress isn't penalised for
 * days that haven't happened.
 */
export function monthSummary(
  keys: readonly string[],
  records: ReadonlyMap<string, DayRecord>,
  rules: WorkRules,
  holidays: ReadonlySet<string>,
  today: string,
): MonthSummary {
  const s: MonthSummary = {
    present: 0,
    absent: 0,
    halfDays: 0,
    remote: 0,
    onDuty: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    missing: 0,
    lateDays: 0,
    totalHours: 0,
    overtime: 0,
    presentEquivalent: 0,
    scheduled: 0,
    percent: null,
  };

  for (const key of keys) {
    if (key > today) break;
    const rec = records.get(key);
    const m = rec ? dayMetrics(rec, rules) : null;
    const working = isWorkingDay(key, rules.weeklyOffs, holidays);

    if (m?.hours != null) s.totalHours += m.hours;
    if (m?.overtime) s.overtime += m.overtime;
    if (m && m.lateMinutes > 0) s.lateDays++;

    if (!m?.status) {
      if (working) {
        s.missing++;
        s.scheduled++;
      }
      continue;
    }

    const meta = STATUS_META[m.status];
    s.presentEquivalent += meta.weight;
    switch (meta.bucket) {
      case "present":
        s.present++;
        break;
      case "absent":
        s.absent++;
        break;
      case "half_day":
        s.halfDays++;
        break;
      case "remote":
        s.remote++;
        break;
      case "on_duty":
        s.onDuty++;
        break;
      case "paid_leave":
        s.paidLeave++;
        break;
      case "unpaid_leave":
        s.unpaidLeave++;
        break;
      case "off":
        break;
    }
    // Days off and paid leave are outside the denominator; work done on a
    // day off still counts towards what was achieved.
    if (meta.bucket !== "off" && meta.bucket !== "paid_leave" && working) {
      s.scheduled++;
    } else if (!working && meta.weight > 0) {
      s.scheduled++;
    }
  }

  s.totalHours = round2(s.totalHours);
  s.overtime = round2(s.overtime);
  s.percent = s.scheduled > 0 ? Math.min(1, s.presentEquivalent / s.scheduled) : null;
  return s;
}

/** The working days a leave covers (weekly offs and holidays skipped). */
export function leaveWorkingDays(
  start: string,
  end: string,
  weeklyOffs: readonly number[],
  holidays: ReadonlySet<string>,
): string[] {
  return dateRange(start, end).filter((k) => isWorkingDay(k, weeklyOffs, holidays));
}
