"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startOnboarding } from "@/lib/actions/onboarding";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
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
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function StartOnboardingDialog({
  people,
  templates,
  today,
  trigger,
}: {
  /** Active employees who don't have an onboarding yet. */
  people: { id: string; name: string }[];
  templates: { id: string; name: string; steps: number }[];
  /** "YYYY-MM-DD" in IST, the default start date. */
  today: string;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await startOnboarding({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.success ?? "Started");
      setError(undefined);
      markClean();
      setOpen(false);
      if (res.id) router.push(`/onboarding/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start onboarding</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={onAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile_id">Who is joining</Label>
            <select
              id="profile_id"
              name="profile_id"
              className={selectClass}
              defaultValue=""
              required
            >
              <option value="" disabled>
                Select an employee…
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Add them under Employees first if they aren&apos;t listed.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template_id">Checklist</Label>
            <select
              id="template_id"
              name="template_id"
              className={selectClass}
              defaultValue={templates.length === 1 ? templates[0].id : ""}
              required
            >
              <option value="" disabled>
                Select a template…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.steps} steps)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start date</Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={today}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Starting…" : "Start onboarding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
