"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE, getSessionProfile } from "@/lib/auth";
import { istInstant, istToday } from "@/lib/format";
import {
  dateRange,
  hhmmToMinutes,
  isAttendanceStatus,
  isHHmm,
  isLeaveType,
  leaveWorkingDays,
  statusForLeave,
} from "@/lib/attendance";
import {
  canManageAttendanceOf,
  getHolidayKeys,
  getWorkRules,
} from "@/lib/attendance-data";

export type AttendanceState = { error?: string; success?: string };

const MAX_LEAVE_DAYS = 60;

const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const dbDate = (key: string) => new Date(`${key}T00:00:00Z`);

function revalidate() {
  revalidatePath("/attendance");
  revalidatePath("/");
}

async function requireSession() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  return session;
}

// -- Self check-in / check-out -------------------------------------------------

/** Check yourself in for today (IST). Anyone signed in can. */
export async function checkIn(): Promise<AttendanceState> {
  const session = await requireSession();
  const where = {
    profile_id_work_date: { profile_id: session.userId, work_date: dbDate(istToday()) },
  };
  const existing = await prisma.attendance.findUnique({ where, select: { check_in: true } });
  if (existing?.check_in) return { error: "You've already checked in today." };

  const now = new Date();
  await prisma.attendance.upsert({
    where,
    create: { profile_id: session.userId, work_date: dbDate(istToday()), check_in: now },
    update: { check_in: now },
  });
  revalidate();
  return { success: "Checked in." };
}

/** Check yourself out for today. Needs a check-in first. */
export async function checkOut(): Promise<AttendanceState> {
  const session = await requireSession();
  const where = {
    profile_id_work_date: { profile_id: session.userId, work_date: dbDate(istToday()) },
  };
  const existing = await prisma.attendance.findUnique({
    where,
    select: { check_in: true, check_out: true },
  });
  if (!existing?.check_in) return { error: "Check in first." };
  if (existing.check_out) return { error: "You've already checked out today." };

  await prisma.attendance.update({ where, data: { check_out: new Date() } });
  revalidate();
  return { success: "Checked out." };
}

// -- Lead / admin register ---------------------------------------------------

/**
 * Set one person's day in the register: times, status and remarks. Only for a
 * lead's own reportees, or anyone with attendance.manage_all. Clearing every
 * field removes the day's record.
 */
export async function saveAttendance(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const session = await requireSession();
  const profileId = String(formData.get("profile_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const checkInRaw = String(formData.get("check_in") ?? "").trim();
  const checkOutRaw = String(formData.get("check_out") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "");
  const remarks = String(formData.get("remarks") ?? "").trim() || null;

  if (!profileId || !isDateKey(date)) return { error: "Missing person or date." };
  if (!(await canManageAttendanceOf(session, profileId))) return { error: DENIED_MESSAGE };
  if (date > istToday()) return { error: "You can't mark attendance for a future day." };

  for (const t of [checkInRaw, checkOutRaw]) {
    if (t && !isHHmm(t)) return { error: "Times must be like 09:30." };
  }
  if (checkInRaw && checkOutRaw && hhmmToMinutes(checkOutRaw) <= hhmmToMinutes(checkInRaw)) {
    return { error: "Check-out must be after check-in." };
  }
  if (checkOutRaw && !checkInRaw) return { error: "Add a check-in time too." };
  if (statusRaw && !isAttendanceStatus(statusRaw)) return { error: "Unknown status." };

  const toInstant = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return istInstant(date, h, m);
  };
  const data = {
    check_in: checkInRaw ? toInstant(checkInRaw) : null,
    check_out: checkOutRaw ? toInstant(checkOutRaw) : null,
    status: statusRaw && isAttendanceStatus(statusRaw) ? statusRaw : null,
    remarks,
    marked_by: session.userId,
  };
  const where = { profile_id_work_date: { profile_id: profileId, work_date: dbDate(date) } };

  if (!data.check_in && !data.status && !remarks) {
    await prisma.attendance.deleteMany({ where: { profile_id: profileId, work_date: dbDate(date) } });
  } else {
    await prisma.attendance.upsert({
      where,
      create: { profile_id: profileId, work_date: dbDate(date), ...data },
      // A hand-set day is no longer owned by a leave, so cancelling that
      // leave later won't undo the lead's correction.
      update: { ...data, leave_id: null },
    });
  }
  revalidate();
  return { success: "Saved." };
}

// -- Leave ---------------------------------------------------------------------

export async function requestLeave(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const session = await requireSession();
  const type = String(formData.get("type") ?? "");
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "") || start;
  const halfDay = String(formData.get("half_day") ?? "") === "on";
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!isLeaveType(type)) return { error: "Pick a leave type." };
  if (!isDateKey(start) || !isDateKey(end)) return { error: "Pick the dates." };
  if (end < start) return { error: "The end date is before the start date." };
  if (halfDay && start !== end) return { error: "A half day must be a single day." };
  if (dateRange(start, end).length > MAX_LEAVE_DAYS) {
    return { error: `Leave can't be longer than ${MAX_LEAVE_DAYS} days.` };
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      profile_id: session.userId,
      status: { in: ["pending", "approved"] },
      start_date: { lte: dbDate(end) },
      end_date: { gte: dbDate(start) },
    },
    select: { id: true },
  });
  if (overlap) return { error: "You already have leave requested for some of those days." };

  await prisma.leaveRequest.create({
    data: {
      profile_id: session.userId,
      type,
      start_date: dbDate(start),
      end_date: dbDate(end),
      half_day: halfDay,
      reason,
    },
  });
  revalidate();
  return { success: "Leave requested. Your lead will be notified on their attendance page." };
}

/** Withdraw your own request while it's still pending. */
export async function cancelLeave(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.leaveRequest.updateMany({
    where: { id, profile_id: session.userId, status: "pending" },
    data: { status: "cancelled" },
  });
  revalidate();
}

/**
 * Approve or reject a request (or cancel one already approved). Approval
 * writes the leave status on each working day it covers, except days the
 * person actually checked in; cancelling an approved leave removes exactly
 * the days it wrote.
 */
export async function decideLeave(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!["approve", "reject", "cancel"].includes(decision)) return { error: "Unknown decision." };

  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) return { error: "That request no longer exists." };
  if (!(await canManageAttendanceOf(session, leave.profile_id))) return { error: DENIED_MESSAGE };

  const decided = { decided_by: session.userId, decided_at: new Date(), decision_note: note };

  if (decision === "cancel") {
    if (leave.status !== "approved") return { error: "Only approved leave can be cancelled here." };
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { leave_id: id, check_in: null } }),
      prisma.attendance.updateMany({ where: { leave_id: id }, data: { leave_id: null } }),
      prisma.leaveRequest.update({ where: { id }, data: { status: "cancelled", ...decided } }),
    ]);
    revalidate();
    return { success: "Leave cancelled." };
  }

  if (leave.status !== "pending") return { error: "That request has already been decided." };

  if (decision === "reject") {
    await prisma.leaveRequest.update({ where: { id }, data: { status: "rejected", ...decided } });
    revalidate();
    return { success: "Leave rejected." };
  }

  const start = leave.start_date.toISOString().slice(0, 10);
  const end = leave.end_date.toISOString().slice(0, 10);
  const [rules, holidays] = await Promise.all([getWorkRules(), getHolidayKeys(start, end)]);
  const days = leaveWorkingDays(start, end, rules.weeklyOffs, holidays);
  const status = statusForLeave(leave.type, leave.half_day);

  const checkedIn = new Set(
    (
      await prisma.attendance.findMany({
        where: {
          profile_id: leave.profile_id,
          work_date: { in: days.map(dbDate) },
          check_in: { not: null },
        },
        select: { work_date: true },
      })
    ).map((a) => a.work_date.toISOString().slice(0, 10)),
  );

  await prisma.$transaction([
    ...days
      .filter((d) => !checkedIn.has(d))
      .map((d) =>
        prisma.attendance.upsert({
          where: { profile_id_work_date: { profile_id: leave.profile_id, work_date: dbDate(d) } },
          create: {
            profile_id: leave.profile_id,
            work_date: dbDate(d),
            status,
            leave_id: id,
            marked_by: session.userId,
          },
          update: { status, leave_id: id, marked_by: session.userId },
        }),
      ),
    prisma.leaveRequest.update({ where: { id }, data: { status: "approved", ...decided } }),
  ]);
  revalidate();
  return { success: "Leave approved." };
}

// -- Settings ------------------------------------------------------------------

export async function saveWorkSettings(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  if (!(await authorize("attendance.manage_all"))) return { error: DENIED_MESSAGE };
  const shiftStart = String(formData.get("shift_start") ?? "");
  const shiftEnd = String(formData.get("shift_end") ?? "");
  const morning = String(formData.get("morning_meeting") ?? "") || "09:30";
  const eod = String(formData.get("eod_meeting") ?? "") || "17:30";
  const callTarget = Number(formData.get("daily_call_target") ?? 60);
  const grace = Number(formData.get("late_grace_minutes"));
  const hours = Number(formData.get("standard_hours"));
  const offs = [
    ...new Set(
      formData
        .getAll("weekly_offs")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ].sort();

  if (![shiftStart, shiftEnd, morning, eod].every(isHHmm)) {
    return { error: "Times must be like 09:30." };
  }
  if (hhmmToMinutes(shiftEnd) <= hhmmToMinutes(shiftStart)) {
    return { error: "The day must end after it starts." };
  }
  if (!Number.isInteger(grace) || grace < 0 || grace > 180) {
    return { error: "Grace period must be 0–180 minutes." };
  }
  if (!Number.isInteger(callTarget) || callTarget < 0 || callTarget > 500) {
    return { error: "Daily call target must be 0–500." };
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) {
    return { error: "Standard hours must be between 0 and 16." };
  }

  const data = {
    shift_start: shiftStart,
    shift_end: shiftEnd,
    late_grace_minutes: grace,
    standard_hours: hours,
    weekly_offs: offs,
    morning_meeting: morning,
    eod_meeting: eod,
    daily_call_target: callTarget,
  };
  await prisma.workSettings.upsert({
    where: { singleton: true },
    create: { singleton: true, ...data },
    update: data,
  });
  revalidate();
  return { success: "Office hours saved." };
}

export async function addHoliday(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  if (!(await authorize("attendance.manage_all"))) return { error: DENIED_MESSAGE };
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isDateKey(date) || !name) return { error: "Holiday needs a date and a name." };

  await prisma.holiday.upsert({
    where: { date: dbDate(date) },
    create: { date: dbDate(date), name },
    update: { name },
  });
  revalidate();
  return { success: "Holiday saved." };
}

export async function deleteHoliday(formData: FormData): Promise<void> {
  if (!(await authorize("attendance.manage_all"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.holiday.deleteMany({ where: { id } });
  revalidate();
}
