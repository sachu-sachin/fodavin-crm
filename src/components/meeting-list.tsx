import Link from "next/link";
import {
  MEETING_TYPES,
  type MeetingListItem,
  type MeetingType,
} from "@/lib/types";
import { formatDateTimeIST } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL = Object.fromEntries(
  MEETING_TYPES.map((t) => [t.value, t.label]),
) as Record<MeetingType, string>;

/** Rows of meetings linking to their pages. Hook-free, so it renders on either side. */
export function MeetingList({
  meetings,
  empty,
}: {
  meetings: MeetingListItem[];
  empty: string;
}) {
  if (meetings.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {meetings.map((m) => {
        const context = [m.company_name, m.project_name].filter(Boolean).join(" · ");
        return (
          <li key={m.id}>
            <Link
              href={`/meetings/${m.id}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border bg-card p-3 hover:border-primary/50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTimeIST(m.starts_at)}
                  {context && ` · ${context}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {m.open_action_count > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {m.open_action_count} open action
                    {m.open_action_count === 1 ? "" : "s"}
                  </span>
                )}
                {m.attendee_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {m.attendee_count} attending
                  </span>
                )}
                <Badge variant="secondary">{TYPE_LABEL[m.type]}</Badge>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
