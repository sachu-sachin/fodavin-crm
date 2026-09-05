"use client";

import { useEffect, useState, useTransition } from "react";
import { moveTaskStatus } from "@/lib/actions/projects";
import {
  TASK_STATUSES,
  TASK_TYPES,
  type Task,
  type TaskStatus,
} from "@/lib/types";
import { formatDateShortIST } from "@/lib/format";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { Badge } from "@/components/ui/badge";

export type BoardTask = Task & { project_name?: string | null };

const TYPE_LABEL = Object.fromEntries(
  TASK_TYPES.map((t) => [t.value, t.label]),
) as Record<string, string>;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dueMeta(due: string | null, done: boolean) {
  if (!due) return null;
  const iso = `${due}T12:00:00+05:30`; // noon IST of the due date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = !done && new Date(iso).getTime() < today.getTime();
  return { label: formatDateShortIST(iso), overdue };
}

export function TaskBoard({
  tasks,
  assignees,
  showProject = false,
}: {
  tasks: BoardTask[];
  assignees: { id: string; name: string }[];
  showProject?: boolean;
}) {
  const [items, setItems] = useState(tasks);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Sync local board items when the parent task list changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(tasks);
  }, [tasks]);

  const nameOf = (id: string | null) =>
    id ? assignees.find((a) => a.id === id)?.name : null;

  function handleDrop(status: TaskStatus, id: string) {
    setDragOver(null);
    const item = items.find((i) => i.id === id);
    if (!item || item.status === status) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    startTransition(() => moveTaskStatus(id, status));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {TASK_STATUSES.map((col) => {
        const colItems = items.filter((i) => i.status === col.value);
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.value);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.value, e.dataTransfer.getData("text/plain"));
            }}
            className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${
              dragOver === col.value ? "border-primary ring-1 ring-primary" : ""
            }`}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{col.label}</span>
              <span className="text-xs text-muted-foreground">
                {colItems.length}
              </span>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {colItems.map((task) => {
                const assignee = nameOf(task.assignee_id);
                const due = dueMeta(task.due_date, task.status === "done");
                return (
                  <TaskFormDialog
                    key={task.id}
                    task={task}
                    assignees={assignees}
                    nativeTrigger={false}
                    trigger={
                      <div
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", task.id)
                        }
                        className="cursor-grab rounded-md border bg-card p-3 shadow-sm hover:border-primary/50 active:cursor-grabbing"
                      >
                        <p className="text-sm font-medium">{task.title}</p>
                        {showProject && task.project_name && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {task.project_name}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {TYPE_LABEL[task.type]}
                          </Badge>
                          <div className="flex items-center gap-2">
                            {due && (
                              <span
                                className={`text-[11px] ${
                                  due.overdue
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {due.label}
                              </span>
                            )}
                            {assignee && (
                              <span
                                title={assignee}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary"
                              >
                                {initials(assignee)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
