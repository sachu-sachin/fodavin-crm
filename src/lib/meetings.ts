import type { Prisma } from "@prisma/client";
import type { MeetingListItem } from "@/lib/types";

/** The fields every meeting list needs, for prisma.meeting.findMany. */
export const MEETING_LIST_SELECT = {
  id: true,
  title: true,
  type: true,
  starts_at: true,
  company_id: true,
  project_id: true,
  company: { select: { name: true } },
  project: { select: { name: true } },
  _count: {
    select: {
      attendees: true,
      action_items: { where: { status: { not: "done" } } },
    },
  },
} satisfies Prisma.MeetingSelect;

type MeetingListRow = Prisma.MeetingGetPayload<{
  select: typeof MEETING_LIST_SELECT;
}>;

export function toMeetingListItem(m: MeetingListRow): MeetingListItem {
  return {
    id: m.id,
    title: m.title,
    type: m.type,
    starts_at: m.starts_at.toISOString(),
    company_id: m.company_id,
    company_name: m.company?.name ?? null,
    project_id: m.project_id,
    project_name: m.project?.name ?? null,
    attendee_count: m._count.attendees,
    open_action_count: m._count.action_items,
  };
}

/** "30 min", "1 hr", "1.5 hrs"; null when no duration is set. */
export function durationLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} hr${minutes === 60 ? "" : "s"}`;
}

/**
 * Split into today-and-later (soonest first) and earlier (most recent first).
 * A meeting from earlier today still counts as current, so its notes and
 * action items stay at the top while they're being written up.
 */
export function splitMeetings<T extends { starts_at: string }>(
  meetings: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const startOfToday = new Date(`${today}T00:00:00+05:30`).getTime();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const m of meetings) {
    (new Date(m.starts_at).getTime() >= startOfToday ? upcoming : past).push(m);
  }
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  past.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}
