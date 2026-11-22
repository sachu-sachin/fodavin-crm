import type { Task as TaskRow } from "@prisma/client";
import type { Task } from "@/lib/types";

/**
 * A task row as a plain object for client components: named fields only,
 * dates as strings and Decimal hours as numbers (a Prisma Decimal can't
 * cross to the browser, and spreading a row would pass whatever columns get
 * added later).
 */
export function toTaskDTO(t: TaskRow): Task {
  return {
    id: t.id,
    project_id: t.project_id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    assignee_id: t.assignee_id,
    meeting_id: t.meeting_id,
    onboarding_id: t.onboarding_id,
    position: t.position,
    due_date: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
    created_by: t.created_by,
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
    priority: t.priority,
    workstream: t.workstream,
    allocated_hours: t.allocated_hours == null ? null : Number(t.allocated_hours),
    actual_hours: t.actual_hours == null ? null : Number(t.actual_hours),
    started_at: t.started_at?.toISOString() ?? null,
    completed_at: t.completed_at?.toISOString() ?? null,
  };
}
