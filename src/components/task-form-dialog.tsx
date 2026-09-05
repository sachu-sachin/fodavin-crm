"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask, updateTask, deleteTask } from "@/lib/actions/projects";
import { TASK_TYPES, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function TaskFormDialog({
  task,
  assignees,
  projects,
  fixedProjectId,
  defaultStatus = "todo",
  trigger,
  nativeTrigger = true,
}: {
  task?: Task;
  assignees: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  fixedProjectId?: string;
  defaultStatus?: TaskStatus;
  trigger: React.ReactElement;
  nativeTrigger?: boolean;
}) {
  const isEdit = !!task;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const projectId = fixedProjectId ?? task?.project_id ?? "";

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateTask : createTask)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        setOpen(false);
      }
    });
  }

  function onDelete() {
    if (!task) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", task.id);
      if (task.project_id) fd.set("project_id", task.project_id);
      await deleteTask(fd);
      toast.success("Task deleted");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={nativeTrigger} render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <form action={onAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={task.id} />}
          {projectId && (
            <input type="hidden" name="project_id" value={projectId} />
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={task?.title ?? ""}
              required
            />
          </div>

          {!fixedProjectId && !isEdit && projects && (
            <div className="space-y-2">
              <Label htmlFor="project_id">Project</Label>
              <select
                id="project_id"
                name="project_id"
                className={selectClass}
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select a project…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Discipline</Label>
              <select
                id="type"
                name="type"
                className={selectClass}
                defaultValue={task?.type ?? "general"}
              >
                {TASK_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className={selectClass}
                defaultValue={task?.status ?? defaultStatus}
              >
                {TASK_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="assignee_id">Assignee</Label>
              <select
                id="assignee_id"
                name="assignee_id"
                className={selectClass}
                defaultValue={task?.assignee_id ?? ""}
              >
                <option value="">— Unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={task?.due_date ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={task?.description ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={onDelete}
                disabled={pending}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
