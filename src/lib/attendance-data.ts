import "server-only";
import { prisma } from "@/lib/prisma";
import { can, type SessionProfile } from "@/lib/auth";
import { DEFAULT_RULES, type WorkRules } from "@/lib/attendance";

/** Office hours and rules, falling back to the defaults until saved once. */
export async function getWorkRules(): Promise<WorkRules> {
  const row = await prisma.workSettings.findUnique({ where: { singleton: true } });
  if (!row) return DEFAULT_RULES;
  return {
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    lateGraceMinutes: row.late_grace_minutes,
    standardHours: Number(row.standard_hours),
    weeklyOffs: row.weekly_offs,
    morningMeeting: row.morning_meeting,
    eodMeeting: row.eod_meeting,
    dailyCallTarget: row.daily_call_target,
  };
}

/** Holiday date keys between two keys, inclusive. */
export async function getHolidayKeys(start: string, end: string): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: {
      date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) },
    },
    select: { date: true },
  });
  return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
}

/**
 * May this session mark attendance / decide leave for `profileId`?
 * Admins and `attendance.manage_all` for anyone; a lead with
 * `attendance.manage_team` only for the people who report directly to them.
 * Never for yourself, unless you can manage everyone.
 */
export async function canManageAttendanceOf(
  session: SessionProfile,
  profileId: string,
): Promise<boolean> {
  if (can(session, "attendance.manage_all")) return true;
  if (!can(session, "attendance.manage_team")) return false;
  if (profileId === session.userId) return false;
  const person = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { reports_to_id: true },
  });
  return person?.reports_to_id === session.userId;
}

/**
 * Whose attendance this session may see beyond their own: everyone (view_all
 * or manage_all), their direct reports (manage_team), or nobody.
 */
export async function visiblePeople(
  session: SessionProfile,
): Promise<{ id: string; name: string; canEdit: boolean }[]> {
  const all = can(session, "attendance.view_all");
  const team = can(session, "attendance.manage_team");
  if (!all && !team) return [];

  const people = await prisma.profile.findMany({
    where: {
      is_active: true,
      ...(all ? {} : { reports_to_id: session.userId }),
    },
    select: { id: true, full_name: true, email: true, reports_to_id: true },
    orderBy: { full_name: "asc" },
  });
  const manageAll = can(session, "attendance.manage_all");
  return people.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
    canEdit:
      manageAll || (team && p.reports_to_id === session.userId && p.id !== session.userId),
  }));
}
