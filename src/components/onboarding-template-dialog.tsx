"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTemplate, saveTemplate } from "@/lib/actions/onboarding";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { MAX_OFFSET_DAYS, MIN_OFFSET_DAYS } from "@/lib/onboarding";
import type { OnboardingTemplateData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm";

/** One editable row. `owner` is "new_hire", "" (unassigned) or a profile id. */
interface Row {
  key: number;
  title: string;
  owner: string;
  days: string;
}

let nextKey = 0;
const blankRow = (): Row => ({ key: nextKey++, title: "", owner: "", days: "0" });

export function OnboardingTemplateDialog({
  template,
  people,
  trigger,
}: {
  template?: OnboardingTemplateData;
  /** Active team members a step can be given to. */
  people: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const isEdit = !!template;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);
  const savedRows = (): Row[] =>
    template
      ? template.items.map((i) => ({
          key: nextKey++,
          title: i.title,
          owner: i.assign_to_new_hire ? "new_hire" : (i.assignee_id ?? ""),
          days: String(i.due_offset_days),
        }))
      : [blankRow(), blankRow(), blankRow()];
  const [rows, setRows] = useState<Row[]>(savedRows);

  // Start from the saved steps every time it opens, so edits abandoned by
  // closing the dialog don't linger.
  function onOpenChange(next: boolean) {
    if (next) {
      setRows(savedRows());
      setError(undefined);
    }
    setOpen(next);
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Descriptions aren't edited here; keep any an existing step already has.
  const descriptionByTitle = new Map(
    (template?.items ?? []).map((i) => [i.title, i.description]),
  );
  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      title: r.title,
      description: descriptionByTitle.get(r.title.trim()) ?? null,
      assign_to_new_hire: r.owner === "new_hire",
      assignee_id: r.owner && r.owner !== "new_hire" ? r.owner : null,
      due_offset_days: Number(r.days),
    })),
  );

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await saveTemplate({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.success ?? "Saved");
      setError(undefined);
      markClean();
      setOpen(false);
    });
  }

  function onDelete() {
    if (!template) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", template.id);
      await deleteTemplate(fd);
      toast.success("Template deleted");
      markClean();
      setOpen(false);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={template?.updated_at ?? "new"} open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit template" : "New checklist template"}</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          action={onAction}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {isEdit && <input type="hidden" name="id" value={template.id} />}
          <input type="hidden" name="items" value={itemsJson} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Developer onboarding"
                defaultValue={template?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                name="description"
                defaultValue={template?.description ?? ""}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Steps</legend>
            <p className="text-xs text-muted-foreground">
              &ldquo;Days&rdquo; counts from the start date: 0 is day one, −3 is three
              days before. Blank steps are ignored.
            </p>
            <div className="hidden grid-cols-[1fr_11rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Step</span>
              <span>Who</span>
              <span>Days</span>
              <span />
            </div>
            {rows.map((row, i) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_2rem] gap-2 sm:grid-cols-[1fr_11rem_5rem_2rem]"
              >
                <Input
                  aria-label={`Step ${i + 1}`}
                  value={row.title}
                  onChange={(e) => update(row.key, { title: e.target.value })}
                  placeholder="e.g. Create email account"
                  className="col-span-1"
                />
                <select
                  aria-label={`Who does step ${i + 1}`}
                  value={row.owner}
                  onChange={(e) => update(row.key, { owner: e.target.value })}
                  className={`${selectClass} order-3 sm:order-none`}
                >
                  <option value="">— Unassigned —</option>
                  <option value="new_hire">The new hire</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Days for step ${i + 1}`}
                  type="number"
                  min={MIN_OFFSET_DAYS}
                  max={MAX_OFFSET_DAYS}
                  step={1}
                  value={row.days}
                  onChange={(e) => update(row.key, { days: e.target.value })}
                  className="order-4 sm:order-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  className="order-2 px-0 sm:order-none"
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, blankRow()])}
            >
              Add step
            </Button>
          </fieldset>

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
              {pending ? "Saving…" : isEdit ? "Save template" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
