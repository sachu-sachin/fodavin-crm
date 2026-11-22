import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toTaskDTO } from "@/lib/task-dto";
import { can, requirePermission } from "@/lib/auth";
import { MEETING_TYPES, type Meeting, type Task } from "@/lib/types";
import { formatDateTimeIST, istToday } from "@/lib/format";
import { durationLabel } from "@/lib/meetings";
import { deleteMeeting } from "@/lib/actions/meetings";
import { PageHeader } from "@/components/page-header";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingNotesEditor } from "@/components/meeting-notes-editor";
import { TaskChecklist } from "@/components/task-checklist";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";


const typeLabel = (v: string) =>
  MEETING_TYPES.find((t) => t.value === v)?.label ?? v;

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("meetings.view");
  const canManage = can(session, "meetings.manage");
  const canManageTasks = can(session, "tasks.manage");
  const { id } = await params;

  const [meeting, companies, openProjects, profiles] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        attendees: { select: { profile_id: true } },
        action_items: { orderBy: { created_at: "asc" } },
      },
    }),
    // Only the edit form needs these.
    canManage
      ? prisma.company.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    canManage
      ? prisma.project.findMany({
          where: { status: { not: "archived" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    // Inactive people too, so a past attendee who has since left still shows
    // by name; only active ones are offered in the forms.
    prisma.profile.findMany({
      select: { id: true, full_name: true, email: true, is_active: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  if (!meeting) notFound();

  // A meeting can belong to a project that has since been archived. Offer it
  // in the edit form anyway, or the select would fall back to "None" and
  // saving would silently unlink it.
  const projects =
    meeting.project && !openProjects.some((p) => p.id === meeting.project!.id)
      ? [meeting.project, ...openProjects]
      : openProjects;

  const nameOf = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email?.split("@")[0] || "User"]),
  );
  const people = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, name: nameOf.get(p.id)! }));
  const attendeeIds = meeting.attendees.map((a) => a.profile_id);

  // Built from named scalars, not a spread of the Prisma result: that also
  // carries the included relations, and this object goes to a client
  // component (see src/app/(app)/projects/[id]/page.tsx).
  const serialized: Meeting = {
    id: meeting.id,
    title: meeting.title,
    type: meeting.type,
    starts_at: meeting.starts_at.toISOString(),
    duration_minutes: meeting.duration_minutes,
    location: meeting.location,
    company_id: meeting.company_id,
    project_id: meeting.project_id,
    agenda: meeting.agenda,
    notes: meeting.notes,
    decisions: meeting.decisions,
    attendee_ids: attendeeIds,
    created_by: meeting.created_by,
    created_at: meeting.created_at.toISOString(),
    updated_at: meeting.updated_at.toISOString(),
  };

  const actionItems: Task[] = meeting.action_items.map(toTaskDTO);

  const duration = durationLabel(meeting.duration_minutes);
  const isLink = meeting.location != null && /^https?:\/\//i.test(meeting.location);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/meetings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to meetings
        </Link>
      </div>

      <PageHeader
        title={meeting.title}
        description={`${formatDateTimeIST(serialized.starts_at)}${duration ? ` · ${duration}` : ""}`}
      >
        {canManage && (
          <>
            <MeetingFormDialog
              meeting={serialized}
              companies={companies}
              projects={projects}
              people={people}
              trigger={<Button variant="outline">Edit</Button>}
            />
            <DeleteEntityButton
              action={deleteMeeting}
              id={meeting.id}
              entity="meeting"
              name={meeting.title}
              impacts={[]}
              extraWarning={
                actionItems.length > 0
                  ? `Its ${actionItems.length} action item${actionItems.length === 1 ? "" : "s"} will be kept as ordinary tasks.`
                  : undefined
              }
            />
          </>
        )}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">{typeLabel(meeting.type)}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TaskChecklist
            parent={{ meetingId: meeting.id }}
            heading="Action items"
            addLabel="Add action item"
            emptyHint="Add one for each follow-up, with an owner and a due date."
            items={actionItems}
            assignees={people}
            today={istToday()}
            canManage={canManageTasks}
          />

          {/* Keyed by meeting, not updated_at: saving the details dialog bumps
              updated_at, and remounting here would throw away notes that are
              typed but not saved yet. */}
          <MeetingNotesEditor
            key={meeting.id}
            meetingId={meeting.id}
            notes={meeting.notes}
            decisions={meeting.decisions}
            canEdit={canManage}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Where">
                {meeting.location == null ? (
                  "—"
                ) : isLink ? (
                  <a
                    href={meeting.location}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {meeting.location}
                  </a>
                ) : (
                  meeting.location
                )}
              </Detail>
              <Detail label="Client">
                {meeting.company ? (
                  <Link
                    href={`/crm/${meeting.company.id}`}
                    className="text-primary hover:underline"
                  >
                    {meeting.company.name}
                  </Link>
                ) : (
                  "Internal"
                )}
              </Detail>
              <Detail label="Project">
                {meeting.project ? (
                  <Link
                    href={`/projects/${meeting.project.id}`}
                    className="text-primary hover:underline"
                  >
                    {meeting.project.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label={`Attendees (${attendeeIds.length})`}>
                {attendeeIds.length === 0 ? (
                  "—"
                ) : (
                  <ul className="space-y-0.5">
                    {attendeeIds.map((pid) => (
                      <li key={pid}>{nameOf.get(pid) ?? "Former employee"}</li>
                    ))}
                  </ul>
                )}
              </Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {meeting.agenda ?? "No agenda."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 break-words">{children}</div>
    </div>
  );
}
