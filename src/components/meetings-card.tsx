import type { MeetingListItem } from "@/lib/types";
import { splitMeetings } from "@/lib/meetings";
import { MeetingList } from "@/components/meeting-list";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** How many past meetings to show under the upcoming ones. */
const RECENT_PAST = 5;

/**
 * Meetings about one client or project: everything upcoming, then the most
 * recent few. "New meeting" pre-selects that client or project.
 */
export function MeetingsCard({
  meetings,
  today,
  form,
}: {
  meetings: MeetingListItem[];
  /** "YYYY-MM-DD" in IST. */
  today: string;
  /** Present only when the viewer may schedule meetings. */
  form?: {
    companies: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    people: { id: string; name: string }[];
    defaultCompanyId?: string;
    defaultProjectId?: string;
  };
}) {
  const { upcoming, past } = splitMeetings(meetings, today);
  const shown = [...upcoming, ...past.slice(0, RECENT_PAST)];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Meetings ({meetings.length})</CardTitle>
        {form && (
          <MeetingFormDialog
            {...form}
            trigger={
              <Button size="sm" variant="outline">
                New meeting
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent>
        <MeetingList meetings={shown} empty="No meetings yet." />
      </CardContent>
    </Card>
  );
}
