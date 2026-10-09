"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMeeting, updateMeeting } from "@/lib/actions/meetings";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { MEETING_DURATIONS, MEETING_TYPES, type Meeting } from "@/lib/types";
import { toISTInputValue } from "@/lib/format";
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

export function MeetingFormDialog({
  meeting,
  companies,
  projects,
  people,
  defaultCompanyId,
  defaultProjectId,
  trigger,
}: {
  meeting?: Meeting;
  companies: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  /** Active team members who can be marked as attending. */
  people: { id: string; name: string }[];
  defaultCompanyId?: string;
  defaultProjectId?: string;
  trigger: React.ReactElement;
}) {
  const isEdit = !!meeting;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  const attending = new Set(meeting?.attendee_ids ?? []);

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateMeeting : createMeeting)({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.success ?? "Saved");
      setError(undefined);
      markClean();
      setOpen(false);
      // A new meeting opens straight away, since its page is where notes
      // and action items get written.
      if (!isEdit && res.id) router.push(`/meetings/${res.id}`);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={meeting?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit meeting" : "New meeting"}</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          action={onAction}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {isEdit && <input type="hidden" name="id" value={meeting.id} />}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Homepage design review"
              defaultValue={meeting?.title ?? ""}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                className={selectClass}
                defaultValue={meeting?.type ?? (defaultCompanyId ? "client" : "internal")}
              >
                {MEETING_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Duration</Label>
              <select
                id="duration_minutes"
                name="duration_minutes"
                className={selectClass}
                defaultValue={String(meeting?.duration_minutes ?? 30)}
              >
                <option value="">— Not set —</option>
                {MEETING_DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} hr${m === 60 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="starts_at">Date & time</Label>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                defaultValue={toISTInputValue(meeting?.starts_at ?? null)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Where / call link</Label>
              <Input
                id="location"
                name="location"
                placeholder="Office, or https://meet…"
                defaultValue={meeting?.location ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="company_id">Client (optional)</Label>
              <select
                id="company_id"
                name="company_id"
                className={selectClass}
                defaultValue={meeting?.company_id ?? defaultCompanyId ?? ""}
              >
                <option value="">— Internal —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project_id">Project (optional)</Label>
              <select
                id="project_id"
                name="project_id"
                className={selectClass}
                defaultValue={meeting?.project_id ?? defaultProjectId ?? ""}
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {people.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Attendees</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="attendee_ids"
                      value={p.id}
                      defaultChecked={attending.has(p.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda</Label>
            <Textarea
              id="agenda"
              name="agenda"
              rows={3}
              defaultValue={meeting?.agenda ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
