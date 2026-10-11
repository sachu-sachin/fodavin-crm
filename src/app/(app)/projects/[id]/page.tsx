import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/auth";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  type DocumentRecord,
  type PaymentMilestone,
  type Project,
  type Task,
} from "@/lib/types";
import { formatINR, formatDateIST, formatDateKey, istToday } from "@/lib/format";
import { MEETING_LIST_SELECT, toMeetingListItem } from "@/lib/meetings";
import { RENEWAL_TONE, renewalStatus } from "@/lib/renewals";
import { getConnectedAccount } from "@/lib/google/drive";
import { SUPABASE_MAX_BYTES } from "@/lib/google/config";
import { PageHeader } from "@/components/page-header";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { TaskBoard } from "@/components/task-board";
import { PaymentsSection } from "@/components/payments-section";
import { DocumentsSection } from "@/components/documents-section";
import { ProjectTimeCard } from "@/components/project-time-card";
import { MeetingsCard } from "@/components/meetings-card";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { deleteProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const label = (list: { value: string; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const prettyDate = (d: Date | null) =>
  d ? formatDateIST(d.toISOString()) : "—";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("projects.view");
  const showMoney = can(session, "finance.view");
  const showMeetings = can(session, "meetings.view");
  const canScheduleMeetings = can(session, "meetings.manage");
  const { id } = await params;

  const [project, companies, profiles, driveAccount, meetings, openProjects] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        tasks: { orderBy: { created_at: "asc" } },
        milestones: { orderBy: { position: "asc" } },
        documents: { orderBy: { created_at: "desc" } },
        time_entries: {
          select: {
            hours: true,
            profile: { select: { full_name: true, email: true } },
          },
        },
      },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { created_at: "asc" },
    }),
    getConnectedAccount(),
    showMeetings
      ? prisma.meeting.findMany({
          where: { project_id: id },
          select: MEETING_LIST_SELECT,
        })
      : [],
    canScheduleMeetings
      ? prisma.project.findMany({
          where: { status: { not: "archived" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

  if (!project) notFound();

  const assignees = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  const uploaderNames = Object.fromEntries(
    assignees.map((a) => [a.id, a.name]),
  );

  // Roll the raw entries up per person for the Time card.
  const hoursByPerson = new Map<string, number>();
  let totalHours = 0;
  for (const entry of project.time_entries) {
    const hours = Number(entry.hours);
    totalHours += hours;
    const who =
      entry.profile.full_name || entry.profile.email?.split("@")[0] || "User";
    hoursByPerson.set(who, (hoursByPerson.get(who) ?? 0) + hours);
  }
  const byPerson = [...hoursByPerson.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours);

  const documents: DocumentRecord[] = project.documents.map((d) => ({
    ...d,
    created_at: d.created_at.toISOString(),
    updated_at: d.updated_at.toISOString(),
  }));

  // Built from explicit scalar fields rather than `...project` — the raw
  // Prisma result also carries `company`, `tasks`, `milestones`, `documents`
  // and `time_entries` (via the `include` above), and time entries have a
  // Decimal `hours` field. A spread would carry all of that as extra
  // runtime properties on an object typed `Project`, and this object is
  // passed whole to the client-side ProjectFormDialog below — silently
  // leaking a raw Decimal across the server/client boundary (see the
  // identical fix and explanation on src/app/(app)/crm/[id]/page.tsx).
  const serializedProject: Project = {
    id: project.id,
    name: project.name,
    type: project.type,
    company_id: project.company_id,
    inquiry_id: project.inquiry_id,
    description: project.description,
    phase: project.phase,
    status: project.status,
    tech_stack: project.tech_stack,
    repo_url: project.repo_url,
    staging_url: project.staging_url,
    production_url: project.production_url,
    domain: project.domain,
    registrar: project.registrar,
    hosting_provider: project.hosting_provider,
    domain_expiry: dateStr(project.domain_expiry),
    hosting_expiry: dateStr(project.hosting_expiry),
    budget: project.budget == null ? null : Number(project.budget),
    start_date: dateStr(project.start_date),
    launch_date: dateStr(project.launch_date),
    created_by: project.created_by,
    created_at: project.created_at.toISOString(),
    updated_at: project.updated_at.toISOString(),
  };

  const tasks: Task[] = project.tasks.map((t) => ({
    ...t,
    due_date: dateStr(t.due_date),
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  }));

  const milestones: PaymentMilestone[] = project.milestones.map((m) => ({
    ...m,
    amount: Number(m.amount),
    due_date: dateStr(m.due_date),
    paid_on: dateStr(m.paid_on),
    created_at: m.created_at.toISOString(),
    updated_at: m.updated_at.toISOString(),
  }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to projects
        </Link>
      </div>

      <PageHeader
        title={project.name}
        description={
          project.company ? project.company.name : "Internal project"
        }
      >
        <ProjectFormDialog
          project={serializedProject}
          companies={companies}
          trigger={<Button variant="outline">Edit</Button>}
        />
        <DeleteEntityButton
          action={deleteProject}
          id={project.id}
          entity="project"
          name={project.name}
          impacts={[
            { label: "task", count: tasks.length },
            { label: "payment milestone", count: milestones.length },
            { label: "document", count: documents.length },
            { label: "time entry", count: project.time_entries.length },
          ]}
          extraWarning={
            documents.some(
              (d) => d.source === "upload" || d.source === "drive_upload",
            )
              ? "Uploaded files will be deleted from storage and Google Drive."
              : undefined
          }
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">{label(PROJECT_TYPES, project.type)}</Badge>
        <Badge variant="outline">{label(PROJECT_PHASES, project.phase)}</Badge>
        <Badge variant={project.status === "active" ? "default" : "outline"}>
          {label(PROJECT_STATUSES, project.status)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tasks</CardTitle>
            <TaskFormDialog
              fixedProjectId={project.id}
              assignees={assignees}
              trigger={
                <Button size="sm" variant="outline">
                  Add task
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tasks yet. Add one to start the board.
              </p>
            ) : (
              <TaskBoard tasks={tasks} assignees={assignees} />
            )}
          </CardContent>
        </Card>

        {showMoney && (
          <PaymentsSection
            projectId={project.id}
            milestones={milestones}
            budget={serializedProject.budget}
            today={istToday()}
          />
        )}

        {showMeetings && (
          <MeetingsCard
            meetings={meetings.map(toMeetingListItem)}
            today={istToday()}
            form={
              canScheduleMeetings
                ? {
                    companies,
                    // An archived project can still be the default here.
                    projects: openProjects.some((p) => p.id === project.id)
                      ? openProjects
                      : [{ id: project.id, name: project.name }, ...openProjects],
                    people: assignees,
                    defaultCompanyId: project.company_id ?? undefined,
                    defaultProjectId: project.id,
                  }
                : undefined
            }
          />
        )}

        <DocumentsSection
          projectId={project.id}
          documents={documents}
          uploaderNames={uploaderNames}
          driveConnected={!!driveAccount}
          supabaseMaxBytes={SUPABASE_MAX_BYTES}
        />
        </div>

        <div className="space-y-6">
          <ProjectTimeCard
            totalHours={totalHours}
            byPerson={byPerson}
            budget={showMoney ? serializedProject.budget : null}
            received={
              showMoney
                ? milestones
                    .filter((m) => m.status === "paid")
                    .reduce((sum, m) => sum + m.amount, 0)
                : 0
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {showMoney && (
                <Detail label="Budget">
                  {formatINR(serializedProject.budget) ?? "—"}
                </Detail>
              )}
              <Detail label="Start date">{prettyDate(project.start_date)}</Detail>
              <Detail label="Launch date">{prettyDate(project.launch_date)}</Detail>
              <Detail label="Tech stack">
                {project.tech_stack.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {project.tech_stack.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links & hosting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Repository">
                <LinkOrDash href={project.repo_url} />
              </Detail>
              <Detail label="Staging">
                <LinkOrDash href={project.staging_url} />
              </Detail>
              <Detail label="Production">
                <LinkOrDash href={project.production_url} />
              </Detail>
              <Detail label="Domain">{project.domain ?? "—"}</Detail>
              <Detail label="Registrar">{project.registrar ?? "—"}</Detail>
              <Detail label="Domain expires">
                <Expiry dateKey={serializedProject.domain_expiry} today={istToday()} />
              </Detail>
              <Detail label="Hosting">{project.hosting_provider ?? "—"}</Detail>
              <Detail label="Hosting expires">
                <Expiry dateKey={serializedProject.hosting_expiry} today={istToday()} />
              </Detail>
            </CardContent>
          </Card>

          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {project.description}
                </p>
              </CardContent>
            </Card>
          )}
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

/** Expiry date plus how urgent it is, so a lapsing domain is obvious here. */
function Expiry({
  dateKey,
  today,
}: {
  dateKey: string | null;
  today: string;
}) {
  if (!dateKey) return <>—</>;
  const status = renewalStatus(dateKey, today);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{formatDateKey(dateKey)}</span>
      <span className={`text-xs ${RENEWAL_TONE[status.state]}`}>
        {status.label}
      </span>
    </span>
  );
}

function LinkOrDash({ href }: { href: string | null }) {
  if (!href) return <>—</>;
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-primary hover:underline"
    >
      {href}
    </a>
  );
}
