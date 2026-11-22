"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DENIED_MESSAGE, getSessionProfile } from "@/lib/auth";
import { canReviewReportsOf } from "@/lib/reports-data";
import { istToday } from "@/lib/format";
import { timingForStatusChange } from "@/lib/task-timing";

export type ReportState = { error?: string; success?: string };

const MAX_TEXT = 5000;
const dbDate = (key: string) => new Date(`${key}T00:00:00Z`);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim().slice(0, MAX_TEXT) || null;

function revalidate() {
  revalidatePath("/reports");
  revalidatePath("/");
  revalidatePath("/tasks");
}

/**
 * Submit (or edit) today's morning plan. The tasks picked must be the
 * person's own; anything else is dropped.
 */
export async function submitMorningReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const plan = text(formData.get("plan"));
  const picked = [...new Set(formData.getAll("task_ids").map(String).filter(Boolean))];
  if (!plan && picked.length === 0) return { error: "Write your plan or pick today's tasks." };

  const own = picked.length
    ? (
        await prisma.task.findMany({
          where: { id: { in: picked }, assignee_id: session.userId },
          select: { id: true },
        })
      ).map((t) => t.id)
    : [];

  const today = istToday();
  await prisma.dailyReport.upsert({
    where: {
      profile_id_report_date_kind: {
        profile_id: session.userId,
        report_date: dbDate(today),
        kind: "morning",
      },
    },
    create: {
      profile_id: session.userId,
      report_date: dbDate(today),
      kind: "morning",
      plan,
      task_ids: own,
    },
    update: { plan, task_ids: own },
  });
  revalidate();
  return { success: "Morning plan submitted." };
}

/**
 * Submit (or edit) today's end-of-day report. Tasks ticked as finished are
 * moved to Done (own tasks only), which stamps their finish time.
 */
export async function submitEodReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const completed = text(formData.get("completed"));
  const pending = text(formData.get("pending"));
  const blockers = text(formData.get("blockers"));
  const doneIds = [...new Set(formData.getAll("done_task_ids").map(String).filter(Boolean))];
  if (!completed && !pending && doneIds.length === 0) {
    return { error: "Say what you completed or what's pending." };
  }

  const now = new Date();
  const tasks = doneIds.length
    ? await prisma.task.findMany({
        where: { id: { in: doneIds }, assignee_id: session.userId, status: { not: "done" } },
        select: { id: true, status: true, started_at: true, completed_at: true, actual_hours: true },
      })
    : [];

  const today = istToday();
  await prisma.$transaction([
    ...tasks.map((t) =>
      prisma.task.update({
        where: { id: t.id },
        data: {
          status: "done",
          ...timingForStatusChange(
            { ...t, actual_hours: t.actual_hours == null ? null : Number(t.actual_hours) },
            "done",
            now,
          ),
        },
      }),
    ),
    prisma.dailyReport.upsert({
      where: {
        profile_id_report_date_kind: {
          profile_id: session.userId,
          report_date: dbDate(today),
          kind: "eod",
        },
      },
      create: {
        profile_id: session.userId,
        report_date: dbDate(today),
        kind: "eod",
        completed,
        pending,
        blockers,
        task_ids: tasks.map((t) => t.id),
      },
      update: {
        completed,
        pending,
        blockers,
        ...(tasks.length ? { task_ids: { push: tasks.map((t) => t.id) } } : {}),
      },
    }),
  ]);
  revalidate();
  return { success: "End-of-day report submitted." };
}

/** A lead's (or admin's) comment on a report. */
export async function reviewReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const note = text(formData.get("review_note"));

  const report = await prisma.dailyReport.findUnique({
    where: { id },
    select: { profile_id: true },
  });
  if (!report) return { error: "That report no longer exists." };
  if (!(await canReviewReportsOf(session, report.profile_id))) return { error: DENIED_MESSAGE };

  await prisma.dailyReport.update({
    where: { id },
    data: {
      review_note: note,
      reviewed_by: note ? session.userId : null,
      reviewed_at: note ? new Date() : null,
    },
  });
  revalidate();
  return { success: note ? "Comment saved." : "Comment removed." };
}
