"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCompany, updateCompany } from "@/lib/actions/crm";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import type { Company } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CompanyFormDialog({
  company,
  trigger,
}: {
  company?: Company;
  trigger: React.ReactElement;
}) {
  const isEdit = !!company;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateCompany : createCompany)({}, formData);
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

  return (
    // Keyed by updated_at: this component instance persists across saves
    // (only `open` toggles), so uncontrolled fields' `defaultValue` would
    // otherwise never re-apply after a save — reopening would show the
    // pre-save values, and re-saving would silently overwrite the real ones
    // with that stale data. The key forces a fresh mount exactly when the
    // underlying record actually changes.
    <Dialog key={company?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit company" : "Add company"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this client's details."
              : "Add a new client to your directory."}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={company.id} />}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={company?.name ?? ""}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                placeholder="https://…"
                defaultValue={company?.website ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                defaultValue={company?.industry ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              name="gstin"
              placeholder="15-character GST number"
              defaultValue={company?.gstin ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={company?.notes ?? ""}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
