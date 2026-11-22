// When a task's status changes, record when the work started and finished,
// so each task carries "start time / end time / actual hours" like the old
// task sheet did, without anyone typing them in.

import { istDateKey } from "@/lib/format";

export type TaskStatusValue = "todo" | "in_progress" | "review" | "done";

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
}

export interface TaskTiming {
  status: TaskStatusValue;
  started_at: Date | null;
  completed_at: Date | null;
  actual_hours: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The timing fields to write when a task moves from `prev` to `next` status.
 * Returns only what changes.
 *
 * - First move out of To do stamps started_at.
 * - Moving to Done stamps completed_at and, if nobody entered actual hours,
 *   fills them from start to finish when both fell on the same IST day (an
 *   overnight span is wall-clock time, not work, so it's left for a person).
 * - Reopening a done task clears completed_at.
 */
export function timingForStatusChange(
  prev: TaskTiming,
  next: TaskStatusValue,
  now: Date,
): Partial<Pick<TaskTiming, "started_at" | "completed_at" | "actual_hours">> {
  const out: Partial<Pick<TaskTiming, "started_at" | "completed_at" | "actual_hours">> = {};
  if (next === prev.status) return out;

  const started = prev.started_at ?? (next !== "todo" ? now : null);
  if (!prev.started_at && next !== "todo") out.started_at = now;

  if (next === "done") {
    out.completed_at = now;
    if (prev.actual_hours == null && started && istDateKey(started) === istDateKey(now)) {
      const hours = round2((now.getTime() - started.getTime()) / 3_600_000);
      if (hours > 0) out.actual_hours = hours;
    }
  } else if (prev.status === "done") {
    out.completed_at = null;
  }
  return out;
}

/** Allocated minus actual, in hours: negative means it took longer. */
export function hoursVariance(allocated: number | null, actual: number | null): number | null {
  if (allocated == null || actual == null) return null;
  return round2(allocated - actual);
}
