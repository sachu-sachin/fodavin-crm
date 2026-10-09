"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/actions/announcements";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { ANNOUNCEMENT_CATEGORIES, type Announcement } from "@/lib/types";
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

export function AnnouncementFormDialog({
  announcement,
  roles,
  trigger,
}: {
  announcement?: Announcement;
  roles: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const isEdit = !!announcement;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  const audience = new Set(announcement?.audience_role_ids ?? []);

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateAnnouncement : createAnnouncement)({}, formData);
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
    if (!announcement) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", announcement.id);
      await deleteAnnouncement(fd);
      toast.success("Announcement deleted");
      markClean();
      setOpen(false);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={announcement?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit announcement" : "New announcement"}</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          action={onAction}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {isEdit && <input type="hidden" name="id" value={announcement.id} />}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Office closed for Diwali"
              defaultValue={announcement?.title ?? ""}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              name="body"
              rows={6}
              defaultValue={announcement?.body ?? ""}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              className={selectClass}
              defaultValue={announcement?.category ?? "general"}
            >
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="publish_at">Publish at</Label>
              <Input
                id="publish_at"
                name="publish_at"
                type="datetime-local"
                defaultValue={toISTInputValue(announcement?.publish_at ?? null)}
              />
              <p className="text-xs text-muted-foreground">Blank means now.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires at (optional)</Label>
              <Input
                id="expires_at"
                name="expires_at"
                type="datetime-local"
                defaultValue={toISTInputValue(announcement?.expires_at ?? null)}
              />
            </div>
          </div>

          {roles.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Audience</legend>
              <p className="text-xs text-muted-foreground">
                Leave all unticked to show it to everyone.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="audience_role_ids"
                      value={r.id}
                      defaultChecked={audience.has(r.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={announcement?.pinned ?? false}
                className="h-4 w-4 rounded border-input"
              />
              Pin to the top
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requires_ack"
                defaultChecked={announcement?.requires_ack ?? false}
                className="h-4 w-4 rounded border-input"
              />
              Ask everyone to confirm they&apos;ve read it
            </label>
            {isEdit && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="reset_reads"
                  className="h-4 w-4 rounded border-input"
                />
                Changed substantially — ask everyone to read it again
              </label>
            )}
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Post announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
