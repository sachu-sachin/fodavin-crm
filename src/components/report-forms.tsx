"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  reviewReport,
  submitEodReport,
  submitMorningReport,
  type ReportState,
} from "@/lib/actions/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PickTask {
  id: string;
  title: string;
  context: string | null;
  /** Hours allocated, if any. */
  allocated: number | null;
}

/** Run an action and toast its result from the handler itself. */
function useToastAction(fn: (prev: ReportState, fd: FormData) => Promise<ReportState>) {
  const [pending, start] = useTransition();
  const action = (fd: FormData) =>
    start(async () => {
      const r = await fn({}, fd);
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  return [action, pending] as const;
}

function TaskPicker({
  name,
  tasks,
  checked,
  empty,
}: {
  name: string;
  tasks: PickTask[];
  checked: Set<string>;
  empty: string;
}) {
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-1">
      {tasks.map((t) => (
        <label key={t.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} value={t.id} defaultChecked={checked.has(t.id)} className="mt-1" />
          <span>
            {t.title}
            {(t.context || t.allocated != null) && (
              <span className="text-muted-foreground">
                {" "}
                · {[t.context, t.allocated != null ? `${t.allocated} h` : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

export function MorningReportForm({
  tasks,
  plan,
  picked,
  submitted,
}: {
  tasks: PickTask[];
  plan: string;
  picked: string[];
  submitted: boolean;
}) {
  const [action, pending] = useToastAction(submitMorningReport);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="plan">Today&apos;s plan</Label>
        <Textarea id="plan" name="plan" rows={4} defaultValue={plan} placeholder="What you'll work on today, in order." />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Tasks for today</legend>
        <TaskPicker name="task_ids" tasks={tasks} checked={new Set(picked)} empty="No open tasks assigned to you." />
      </fieldset>
      <Button type="submit" disabled={pending}>
        {submitted ? "Update morning plan" : "Submit morning plan"}
      </Button>
    </form>
  );
}

export function EodReportForm({
  tasks,
  completed,
  pendingText,
  blockers,
  submitted,
}: {
  /** Open tasks to tick off: today's planned ones first. */
  tasks: PickTask[];
  completed: string;
  pendingText: string;
  blockers: string;
  submitted: boolean;
}) {
  const [action, pending] = useToastAction(submitEodReport);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Finished today (moves them to Done)</legend>
        <TaskPicker name="done_task_ids" tasks={tasks} checked={new Set()} empty="No open tasks to tick off." />
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="completed">Completed</Label>
        <Textarea id="completed" name="completed" rows={3} defaultValue={completed} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pending">Pending, and why</Label>
        <Textarea id="pending" name="pending" rows={2} defaultValue={pendingText} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="blockers">Blockers</Label>
        <Input id="blockers" name="blockers" defaultValue={blockers} placeholder="None" />
      </div>
      <Button type="submit" disabled={pending}>
        {submitted ? "Update EOD report" : "Submit EOD report"}
      </Button>
    </form>
  );
}

export function ReviewForm({ id, note }: { id: string; note: string }) {
  const [action, pending] = useToastAction(reviewReport);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="review_note" defaultValue={note} placeholder="Comment for them" aria-label="Lead comment" className="h-8 min-w-48 flex-1" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Save comment
      </Button>
    </form>
  );
}
