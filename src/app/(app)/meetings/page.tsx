import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/auth";
import { istToday } from "@/lib/format";
import { MEETING_LIST_SELECT, toMeetingListItem } from "@/lib/meetings";
import { PageHeader } from "@/components/page-header";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingsClientList } from "@/components/meetings-client-list";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const session = await requirePermission("meetings.view");
  const canManage = can(session, "meetings.manage");

  const [meetings, companies, projects, profiles] = await Promise.all([
    prisma.meeting.findMany({
      select: MEETING_LIST_SELECT,
      orderBy: { starts_at: "desc" },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const people = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Agendas, notes, decisions — and the action items that come out of them."
      >
        {canManage && (
          <MeetingFormDialog
            companies={companies}
            projects={projects}
            people={people}
            trigger={<Button>New meeting</Button>}
          />
        )}
      </PageHeader>

      <MeetingsClientList
        meetings={meetings.map(toMeetingListItem)}
        companies={companies}
        projects={projects}
        today={istToday()}
      />
    </div>
  );
}
