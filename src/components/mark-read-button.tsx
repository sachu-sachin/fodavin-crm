"use client";

import { useTransition } from "react";
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
      onClick={() => startTransition(() => markAnnouncementRead(id))}
    >
      {pending ? "Saving…" : acknowledge ? "I've read this" : "Mark as read"}
    </Button>
  );
}
