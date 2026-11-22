"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask, updateTask, deleteTask } from "@/lib/actions/projects";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { TASK_TYPES, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/lib/task-timing";
import { formatDateTimeIST } from "@/lib/format";
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
  fixedMeetingId,
  fixedOnboardingId,
  defaultStatus = "todo",
  trigger,
  nativeTrigger = true,
}: {
  task?: Task;
  assignees: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  fixedProjectId?: string;
  /** Create the task as an action item of this meeting (inherits its project). */
  fixedMeetingId?: string;
  /** Create the task as an item on this onboarding checklist. */
  fixedOnboardingId?: string;
  defaultStatus?: TaskStatus;
  trigger: React.ReactElement;
  nativeTrigger?: boolean;
}) {
  const isEdit = !!task;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  const projectId = fixedProjectId ?? task?.project_id ?? "";

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateTask : createTask)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        markClean();
        setOpen(false);
      }
    });
  }

  function onDelete() {
    if (!task) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", task.id);
      await deleteTask(fd);
      toast.success("Task deleted");
      markClean();
      setOpen(false);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={task?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={nativeTrigger} render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit task"
              : fixedMeetingId
                ? "New action item"
                : fixedOnboardingId
                  ? "New checklist item"
                  : "New task"}
          </DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={onAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={task.id} />}
          {projectId && (
            <input type="hidden" name="project_id" value={projectId} />
          )}
          {fixedMeetingId && !isEdit && (
            <input type="hidden" name="meeting_id" value={fixedMeetingId} />
          )}
          {fixedOnboardingId && !isEdit && (
            <input type="hidden" name="onboarding_id" value={fixedOnboardingId} />
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

          {!fixedProjectId && !fixedMeetingId && !fixedOnboardingId && !isEdit && projects && (
            <div className="space-y-2">
              <Label htmlFor="project_id">Project</Label>
              <select
                id="project_id"
                name="project_id"
                className={selectClass}
                defaultValue=""
              >
                <option value="">— No project (individual task) —</option>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                className={selectClass}
                defaultValue={task?.priority ?? "medium"}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workstream">Workstream</Label>
              <Input
                id="workstream"
                name="workstream"
                placeholder="e.g. Meta Ads, SEO"
                defaultValue={task?.workstream ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="allocated_hours">Allocated hours</Label>
              <Input
                id="allocated_hours"
                name="allocated_hours"
                type="number"
                step="0.25"
                min={0}
                defaultValue={task?.allocated_hours ?? ""}
              />
            </div>
            {isEdit && (
              <div className="space-y-2">
                <Label htmlFor="actual_hours">Actual hours</Label>
                <Input
                  id="actual_hours"
                  name="actual_hours"
                  type="number"
                  step="0.25"
                  min={0}
                  defaultValue={task?.actual_hours ?? ""}
                />
              </div>
            )}
          </div>
          {isEdit && (task.started_at || task.completed_at) && (
            <p className="text-xs text-muted-foreground">
              {task.started_at && <>Started {formatDateTimeIST(task.started_at)}</>}
              {task.started_at && task.completed_at && " · "}
              {task.completed_at && <>Finished {formatDateTimeIST(task.completed_at)}</>}
            </p>
          )}

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
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : fixedMeetingId
                    ? "Add action item"
                    : fixedOnboardingId
                      ? "Add item"
                      : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
