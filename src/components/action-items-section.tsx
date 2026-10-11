"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { moveTaskStatus } from "@/lib/actions/projects";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { formatDateKey } from "@/lib/format";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.label]),
) as Record<string, string>;

/**
 * A meeting's action items. They're ordinary tasks, so they also appear on the
 * task boards and in each assignee's "My tasks this week"; ticking one here
 * moves it to Done there too.
 */
export function ActionItemsSection({
  meetingId,
  items,
  assignees,
  today,
  canManage,
}: {
  meetingId: string;
  items: Task[];
  assignees: { id: string; name: string }[];
  /** "YYYY-MM-DD" in IST, for overdue highlighting. */
  today: string;
  /** tasks.manage — add, edit and tick off. */
  canManage: boolean;
}) {
  const [list, setList] = useState(items);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Sync when the server sends a fresh list (after add/edit/delete).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(items);
  }, [items]);

  const nameOf = (id: string | null) =>
    id ? assignees.find((a) => a.id === id)?.name : null;

  // The column each item was in before it was ticked here, so unticking puts
  // it back in "In progress" or "Review" rather than always "To do".
  const statusBeforeDone = useRef(new Map<string, TaskStatus>());

  function toggle(task: Task) {
    const previous = task.status;
    let status: TaskStatus;
    if (previous === "done") {
      status = statusBeforeDone.current.get(task.id) ?? "todo";
      statusBeforeDone.current.delete(task.id);
    } else {
      statusBeforeDone.current.set(task.id, previous);
      status = "done";
    }
    const setStatus = (s: TaskStatus) =>
      setList((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: s } : t)));

    setStatus(status);
    startTransition(async () => {
      try {
        await moveTaskStatus(task.id, status);
      } catch {
        // e.g. the task was deleted in another tab: show what's really saved.
        setStatus(previous);
        toast.error("Couldn't update that item. Reload and try again.");
      }
    });
  }

  const open = list.filter((t) => t.status !== "done").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Action items
          {list.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {open} open of {list.length}
            </span>
          )}
        </CardTitle>
        {canManage && (
          <TaskFormDialog
            fixedMeetingId={meetingId}
            assignees={assignees}
            trigger={
              <Button size="sm" variant="outline">
                Add action item
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No action items yet.
            {canManage && " Add one for each follow-up, with an owner and a due date."}
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((task) => {
              const done = task.status === "done";
              const owner = nameOf(task.assignee_id);
              const overdue = !done && task.due_date != null && task.due_date < today;
              const row = (
                <span className="min-w-0 flex-1 text-left">
                  <span
                    className={`block truncate text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {task.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {owner ?? "Unassigned"}
                    {task.due_date && (
                      <span className={overdue ? "font-medium text-destructive" : ""}>
                        {" · "}
                        {overdue ? "Overdue · " : "Due "}
                        {formatDateKey(task.due_date)}
                      </span>
                    )}
                  </span>
                </span>
              );
              return (
                <li key={task.id} className="flex items-center gap-3 py-2">
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(task)}
                      aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
                      className="h-4 w-4 shrink-0 rounded border-input"
                    />
                  )}
                  {canManage ? (
                    <TaskFormDialog
                      task={task}
                      assignees={assignees}
                      trigger={
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm hover:text-primary"
                        >
                          {row}
                        </button>
                      }
                    />
                  ) : (
                    row
                  )}
                  <Badge variant={done ? "secondary" : "outline"} className="shrink-0">
                    {STATUS_LABEL[task.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
