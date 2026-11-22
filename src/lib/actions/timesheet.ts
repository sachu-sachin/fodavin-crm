"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  can,
  DENIED_MESSAGE,
  getSessionProfile,
  TIMESHEET_OFF_MESSAGE,
  timesheetOff,
  type SessionProfile,
} from "@/lib/auth";
import { MAX_HOURS_PER_DAY } from "@/lib/types";

export type TimesheetState = { error?: string; success?: string };

/**
 * You may only log time against yourself — unless you're an admin, who can
 * correct anyone's sheet. Returns the profile id to write against.
 *
 * Takes an already-resolved session rather than calling `redirect()` itself:
 * `redirect()` works by throwing, and every caller here wraps this in a
 * try/catch to turn a *permission* error into a friendly `{ error }` state —
 * a throw from inside that try would get swallowed as "Not allowed." instead
 * of ever reaching the browser as an actual redirect.
 */
function resolveTarget(session: SessionProfile, requestedProfileId?: string): string {
  if (!requestedProfileId || requestedProfileId === session.userId) {
    if (!can(session, "timesheet.log")) {
      throw new Error(DENIED_MESSAGE);
    }
    if (timesheetOff(session)) throw new Error(TIMESHEET_OFF_MESSAGE);
    return session.userId;
  }
  // Editing someone else's sheet is a separate, higher permission.
  if (!can(session, "timesheet.manage_all")) {
    throw new Error("You can only edit your own timesheet.");
  }
  return requestedProfileId;
}

function isDateKey(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Upsert one cell of the weekly grid.
 *
 * Zero means "no work logged", which is the absence of a row rather than a
 * row of 0 — otherwise empty weeks would accumulate meaningless records and
 * every total would need to filter them out.
 */
export async function saveTimeEntry(input: {
  projectId: string;
  workDate: string;
  hours: number;
  note?: string;
  profileId?: string;
}): Promise<TimesheetState> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  let profileId: string;
  try {
    profileId = resolveTarget(session, input.profileId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not allowed." };
  }

  if (!input.projectId) return { error: "Pick a project." };
  if (!isDateKey(input.workDate)) return { error: "Invalid date." };

  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours < 0) {
    return { error: "Hours must be a positive number." };
  }
  if (hours > MAX_HOURS_PER_DAY) {
    return { error: `A day can't hold more than ${MAX_HOURS_PER_DAY} hours.` };
  }

  const workDate = new Date(`${input.workDate}T00:00:00Z`);
  const where = {
    profile_id_project_id_work_date: {
      profile_id: profileId,
      project_id: input.projectId,
      work_date: workDate,
    },
  };

  if (hours === 0) {
    await prisma.timeEntry.deleteMany({
      where: {
        profile_id: profileId,
        project_id: input.projectId,
        work_date: workDate,
      },
    });
  } else {
    await prisma.timeEntry.upsert({
      where,
      create: {
        profile_id: profileId,
        project_id: input.projectId,
        work_date: workDate,
        hours,
        note: input.note?.trim() || null,
      },
      update: {
        hours,
        ...(input.note !== undefined && { note: input.note.trim() || null }),
      },
    });
  }

  revalidatePath("/timesheet");
  revalidatePath(`/projects/${input.projectId}`);
  return { success: "Saved" };
}

/** Copy the previous week's pattern forward — the usual "same as last week". */
export async function copyPreviousWeek(input: {
  weekStart: string;
  previousWeekStart: string;
  profileId?: string;
}): Promise<TimesheetState> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  let profileId: string;
  try {
    profileId = resolveTarget(session, input.profileId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not allowed." };
  }

  if (!isDateKey(input.weekStart) || !isDateKey(input.previousWeekStart)) {
    return { error: "Invalid week." };
  }

  const prevStart = new Date(`${input.previousWeekStart}T00:00:00Z`);
  const prevEnd = new Date(prevStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() + 6);

  const previous = await prisma.timeEntry.findMany({
    where: {
      profile_id: profileId,
      work_date: { gte: prevStart, lte: prevEnd },
    },
  });

  if (previous.length === 0) {
    return { error: "Last week is empty — nothing to copy." };
  }

  const shift = 7 * 24 * 60 * 60 * 1000;

  // Skip cells already filled this week rather than overwriting them: the
  // user's own entries must win over a bulk copy.
  await prisma.timeEntry.createMany({
    data: previous.map((entry) => ({
      profile_id: profileId,
      project_id: entry.project_id,
      work_date: new Date(entry.work_date.getTime() + shift),
      hours: entry.hours,
      note: entry.note,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/timesheet");
  return { success: "Copied last week." };
}
