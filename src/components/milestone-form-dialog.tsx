"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "@/lib/actions/finance";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { MILESTONE_STATUSES, type PaymentMilestone } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function MilestoneFormDialog({
  projectId,
  milestone,
  trigger,
  nativeTrigger = true,
}: {
  projectId: string;
  milestone?: PaymentMilestone;
  trigger: React.ReactElement;
  nativeTrigger?: boolean;
}) {
  const isEdit = !!milestone;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateMilestone : createMilestone)(
        {},
        formData,
      );
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
    if (!milestone) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", milestone.id);
      await deleteMilestone(fd);
      toast.success("Milestone deleted");
      markClean();
      setOpen(false);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={milestone?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={nativeTrigger} render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit payment" : "Add payment milestone"}
          </DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={onAction} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          {isEdit && <input type="hidden" name="id" value={milestone.id} />}
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              name="label"
              placeholder="e.g. Advance (40%)"
              defaultValue={milestone?.label ?? ""}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0"
                defaultValue={milestone?.amount ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className={selectClass}
                defaultValue={milestone?.status ?? "pending"}
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={milestone?.due_date ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_no">Invoice no.</Label>
              <Input
                id="invoice_no"
                name="invoice_no"
                placeholder="Optional"
                defaultValue={milestone?.invoice_no ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={milestone?.notes ?? ""}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The paid date is recorded automatically when you mark a milestone
            paid.
          </p>
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
