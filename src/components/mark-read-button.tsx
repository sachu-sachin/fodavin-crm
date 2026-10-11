"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { markAnnouncementRead } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";

/** "Mark as read", or "I've read this" for announcements needing acknowledgement. */
export function MarkReadButton({
  id,
  acknowledge,
}: {
  id: string;
  acknowledge: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={acknowledge ? "default" : "outline"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // On success the page re-renders without this button; only a
          // refusal (expired, retargeted or deleted meanwhile) needs a word.
          const res = await markAnnouncementRead(id);
          if (res.error) toast.error(res.error);
        })
      }
    >
      {pending ? "Saving…" : acknowledge ? "I've read this" : "Mark as read"}
    </Button>
  );
}
