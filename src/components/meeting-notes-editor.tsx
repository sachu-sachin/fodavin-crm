"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMeetingNotes } from "@/lib/actions/meetings";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Notes and decisions, edited in place on the meeting page so they can be
 * typed during the meeting. Read-only for anyone without meetings.manage.
 */
export function MeetingNotesEditor({
  meetingId,
  notes,
  decisions,
  canEdit,
}: {
  meetingId: string;
  notes: string | null;
  decisions: string | null;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, isDirty, markClean } = useGuardedForm(canEdit);

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes & decisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ReadOnly label="Notes" text={notes} />
          <ReadOnly label="Decisions" text={decisions} />
        </CardContent>
      </Card>
    );
  }

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await saveMeetingNotes({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        markClean();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes & decisions</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={onAction} className="space-y-4">
          <input type="hidden" name="id" value={meetingId} />
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={8}
              placeholder="What was discussed…"
              defaultValue={notes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decisions">Decisions</Label>
            <Textarea
              id="decisions"
              name="decisions"
              rows={3}
              placeholder="What was agreed…"
              defaultValue={decisions ?? ""}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            {isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save notes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReadOnly({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap">
        {text ?? <span className="text-muted-foreground">Nothing recorded.</span>}
      </p>
    </div>
  );
}
