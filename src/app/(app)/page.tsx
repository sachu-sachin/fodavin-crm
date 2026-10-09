import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import {
  OPEN_INQUIRY_STAGES,
  RENEWAL_WINDOW_DAYS,
  UNPAID_MILESTONE_STATUSES,
} from "@/lib/types";
import { formatDateKey, formatINR, formatTimeIST, istToday } from "@/lib/format";
import { RENEWAL_TONE, renewalStatus } from "@/lib/renewals";
import { addDays } from "@/lib/week";
import { PageHeader } from "@/components/page-header";
import { DashboardCard, DashboardRow } from "@/components/dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const showMoney = can(session, "finance.view");
  const showRenewals = can(session, "projects.view");
  const showMeetings = can(session, "meetings.view");

  const today = istToday();
  // End-of-day in IST, so something dated today counts as due now rather
  // than tomorrow.
  const startOfToday = new Date(`${today}T00:00:00+05:30`);
  const endOfToday = new Date(`${today}T23:59:59+05:30`);
  const renewalHorizon = new Date(
    `${addDays(today, RENEWAL_WINDOW_DAYS)}T23:59:59+05:30`,
  );
  const weekAhead = new Date(`${addDays(today, 7)}T23:59:59+05:30`);

  const [
    companies,
    openInquiries,
    activeProjects,
    openTasks,
    dueFollowUps,
    outstandingTotal,
    unpaidMilestones,
    renewalProjects,
    myTasks,
    todaysMeetings,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.inquiry.count({ where: { stage: { notIn: ["won", "lost"] } } }),
    prisma.project.count({ where: { status: "active" } }),
    prisma.task.count({ where: { status: { not: "done" } } }),
    prisma.inquiry.findMany({
      where: {
        stage: { in: OPEN_INQUIRY_STAGES },
        next_follow_up: { lte: endOfToday },
      },
      select: {
        id: true,
        title: true,
        next_follow_up: true,
        company: { select: { name: true } },
      },
      orderBy: { next_follow_up: "asc" },
      take: 5,
    }),
    prisma.paymentMilestone.aggregate({
      where: { status: { in: UNPAID_MILESTONE_STATUSES } },
      _sum: { amount: true },
    }),
    prisma.paymentMilestone.findMany({
      where: { status: { in: UNPAID_MILESTONE_STATUSES } },
      select: {
        id: true,
        label: true,
        amount: true,
        due_date: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { due_date: { sort: "asc", nulls: "last" } },
      take: 5,
    }),
    // Archived projects are excluded: a site we no longer run isn't our
    // renewal to chase.
    prisma.project.findMany({
      where: {
        status: { not: "archived" },
        OR: [
          { domain_expiry: { lte: renewalHorizon } },
          { hosting_expiry: { lte: renewalHorizon } },
        ],
      },
      select: {
        id: true,
        name: true,
        domain: true,
        domain_expiry: true,
        hosting_expiry: true,
      },
    }),
    prisma.task.findMany({
      where: {
        assignee_id: session.userId,
        status: { not: "done" },
        due_date: { lte: weekAhead },
      },
      select: {
        id: true,
        title: true,
        due_date: true,
        project: { select: { id: true, name: true } },
        meeting_id: true,
      },
      orderBy: { due_date: "asc" },
      take: 5,
    }),
    showMeetings
      ? prisma.meeting.findMany({
          where: { starts_at: { gte: startOfToday, lte: endOfToday } },
          select: {
            id: true,
            title: true,
            starts_at: true,
            company: { select: { name: true } },
            attendees: {
              where: { profile_id: session.userId },
              select: { profile_id: true },
            },
          },
          orderBy: { starts_at: "asc" },
        })
      : [],
  ]);

  const outstanding = Number(outstandingTotal._sum.amount ?? 0);

  // A project can have both a domain and a hosting renewal pending; each is a
  // separate thing to act on, so flatten them into one sorted list.
  const renewals = renewalProjects
    .flatMap((project) => {
      const rows: {
        key: string;
        projectId: string;
        name: string;
        kind: string;
        expiry: string;
      }[] = [];
      const domain = dateStr(project.domain_expiry);
      const hosting = dateStr(project.hosting_expiry);
      if (domain) {
        rows.push({
          key: `${project.id}-domain`,
          projectId: project.id,
          name: project.domain ?? project.name,
          kind: "Domain",
          expiry: domain,
        });
      }
      if (hosting) {
        rows.push({
          key: `${project.id}-hosting`,
          projectId: project.id,
          name: project.name,
          kind: "Hosting",
          expiry: hosting,
        });
      }
      return rows;
    })
    .filter((r) => renewalStatus(r.expiry, today).daysLeft <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.expiry.localeCompare(b.expiry))
    .slice(0, 5);

  const stats = [
    { label: "Clients", value: companies, href: "/crm" },
    { label: "Open Inquiries", value: openInquiries, href: "/pipeline" },
    { label: "Active Projects", value: activeProjects, href: "/projects" },
    { label: "Open Tasks", value: openTasks, href: "/tasks" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="What needs attention today, across clients, money and delivery."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <DashboardCard
          title="My tasks this week"
          count={myTasks.length}
          tone="warn"
          empty="Nothing assigned to you is due in the next 7 days."
        >
          {myTasks.length > 0 &&
            myTasks.map((task) => {
              const due = dateStr(task.due_date);
              const overdue = due != null && due < today;
              return (
                <DashboardRow
                  key={task.id}
                  href={
                    task.project
                      ? `/projects/${task.project.id}`
                      : task.meeting_id
                        ? `/meetings/${task.meeting_id}`
                        : "/tasks"
                  }
                  primary={task.title}
                  secondary={task.project?.name}
                  trailing={
                    <span
                      className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                    >
                      {due
                        ? `${overdue ? "Overdue · " : ""}${formatDateKey(due)}`
                        : "No date"}
                    </span>
                  }
                />
              );
            })}
        </DashboardCard>

        {showMeetings && (
        <DashboardCard
          title="Today's meetings"
          count={todaysMeetings.length}
          tone="warn"
          empty="No meetings today."
        >
          {todaysMeetings.length > 0 &&
            todaysMeetings.map((m) => (
              <DashboardRow
                key={m.id}
                href={`/meetings/${m.id}`}
                primary={m.title}
                secondary={
                  [m.company?.name, m.attendees.length > 0 ? "You're attending" : null]
                    .filter(Boolean)
                    .join(" · ") || null
                }
                trailing={
                  <span className="text-xs text-muted-foreground">
                    {formatTimeIST(m.starts_at.toISOString())}
                  </span>
                }
              />
            ))}
        </DashboardCard>
        )}

        {showRenewals && (
        <DashboardCard
          title="Renewals due"
          count={renewals.length}
          empty={`No domains or hosting expiring in the next ${RENEWAL_WINDOW_DAYS} days.`}
        >
          {renewals.length > 0 &&
            renewals.map((row) => {
              const status = renewalStatus(row.expiry, today);
              return (
                <DashboardRow
                  key={row.key}
                  href={`/projects/${row.projectId}`}
                  primary={row.name}
                  secondary={row.kind}
                  trailing={
                    <span className={`text-xs ${RENEWAL_TONE[status.state]}`}>
                      {status.label}
                    </span>
                  }
                />
              );
            })}
        </DashboardCard>
        )}

        <DashboardCard
          title="Follow-ups due"
          count={dueFollowUps.length}
          empty="Nothing to chase today. Set a next follow-up date on an inquiry to see it here."
        >
          {dueFollowUps.length > 0 &&
            dueFollowUps.map((inquiry) => {
              const due = dateStr(inquiry.next_follow_up);
              const overdue = due != null && due < today;
              return (
                <DashboardRow
                  key={inquiry.id}
                  href="/pipeline"
                  primary={inquiry.title}
                  secondary={inquiry.company?.name}
                  trailing={
                    <span
                      className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                    >
                      {overdue ? "Overdue · " : "Today · "}
                      {due ? formatDateKey(due) : ""}
                    </span>
                  }
                />
              );
            })}
        </DashboardCard>

        {showMoney && (
        <DashboardCard
          title="Money outstanding"
          figure={
            <span
              className={
                outstanding > 0
                  ? "text-lg font-semibold text-amber-600 dark:text-amber-400"
                  : "text-lg font-semibold text-muted-foreground"
              }
            >
              {formatINR(outstanding)}
            </span>
          }
          empty="Nothing outstanding. Add payment milestones to a project to track what clients owe you."
        >
          {unpaidMilestones.length > 0 &&
            unpaidMilestones.map((m) => {
              const due = dateStr(m.due_date);
              const overdue = due != null && due < today;
              return (
                <DashboardRow
                  key={m.id}
                  href={`/projects/${m.project.id}`}
                  primary={m.project.name}
                  secondary={m.label}
                  trailing={
                    <>
                      <span className="font-medium">
                        {formatINR(Number(m.amount))}
                      </span>
                      <span
                        className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        {due
                          ? `${overdue ? "Overdue · " : ""}${formatDateKey(due)}`
                          : "No date"}
                      </span>
                    </>
                  }
                />
              );
            })}
        </DashboardCard>
        )}
      </div>
    </div>
  );
}
