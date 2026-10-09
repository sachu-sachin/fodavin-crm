import {
  ANNOUNCEMENT_CATEGORY_MAP,
  type Announcement,
} from "@/lib/types";
import type { AnnouncementStatus } from "@/lib/announcements";
import { formatDateTimeIST } from "@/lib/format";
import { AnnouncementFormDialog } from "@/components/announcement-form-dialog";
import { MarkReadButton } from "@/components/mark-read-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Read receipts, shown only to people who manage announcements. */
export interface ReadReceipts {
  read: number;
  audience: number;
  /** Names of audience members who haven't read it yet. */
  pending: string[];
  /** Role names the audience is limited to; empty means everyone. */
  audienceRoles: string[];
}

export function AnnouncementCard({
  announcement: a,
  status,
  authorName,
  isRead,
  receipts,
  roles,
}: {
  announcement: Announcement;
  status: AnnouncementStatus;
  authorName: string | null;
  /** Whether the viewer has read it; only matters while live. */
  isRead: boolean;
  /** Present for managers. */
  receipts?: ReadReceipts;
  /** Present for managers — enables editing. */
  roles?: { id: string; name: string }[];
}) {
  const category = ANNOUNCEMENT_CATEGORY_MAP[a.category];
  const unread = status === "live" && !isRead;

  return (
    <Card id={`announcement-${a.id}`} className={unread ? "border-primary/50" : undefined}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold">{a.title}</h3>
            <p className="text-xs text-muted-foreground">
              {authorName ?? "Someone"} · {formatDateTimeIST(a.publish_at)}
              {a.expires_at && ` · until ${formatDateTimeIST(a.expires_at)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {a.pinned && status === "live" && <Badge variant="outline">Pinned</Badge>}
            {status === "scheduled" && <Badge variant="outline">Scheduled</Badge>}
            {status === "expired" && <Badge variant="outline">Expired</Badge>}
            {unread && <Badge>New</Badge>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${category.badge}`}>
              {category.label}
            </span>
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm">{a.body}</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {receipts && (
              <details>
                <summary className="cursor-pointer select-none">
                  {a.requires_ack ? "Acknowledged" : "Read"} by {receipts.read} of{" "}
                  {receipts.audience}
                  {receipts.audienceRoles.length > 0 &&
                    ` · only for ${receipts.audienceRoles.join(", ")}`}
                </summary>
                <p className="mt-1">
                  {receipts.pending.length === 0
                    ? "Everyone has."
                    : `Not yet: ${receipts.pending.join(", ")}`}
                </p>
              </details>
            )}
            {!receipts && isRead && status === "live" && (
              <span>{a.requires_ack ? "You acknowledged this." : "Read"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {roles && (
              <AnnouncementFormDialog
                announcement={a}
                roles={roles}
                trigger={
                  <Button size="sm" variant="ghost">
                    Edit
                  </Button>
                }
              />
            )}
            {unread && <MarkReadButton id={a.id} acknowledge={a.requires_ack} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
