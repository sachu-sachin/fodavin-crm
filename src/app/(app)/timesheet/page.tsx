import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionProfile, requirePermission } from "@/lib/auth";
import {
  addDays,
  currentWeekStart,
  normaliseWeekParam,
  weekDays,
  weekRangeLabel,
  DAYS_IN_WEEK,
} from "@/lib/week";
import { PageHeader } from "@/components/page-header";
import {
  TimesheetGrid,
  type GridProject,
  type HoursMap,
} from "@/components/timesheet-grid";
import { TimesheetToolbar } from "@/components/timesheet-toolbar";

export const dynamic = "force-dynamic";

const displayName = (p: {
  full_name: string | null;
  email: string | null;
}) => p.full_name || p.email?.split("@")[0] || "User";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("timesheet.log");
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const params = await searchParams;
  const weekStart = normaliseWeekParam(
    typeof params.week === "string" ? params.week : undefined,
  );

  // Only admins may look at someone else's sheet; anyone else is pinned to
  // their own regardless of what the query string says.
  const requestedPerson =
    typeof params.person === "string" ? params.person : undefined;
  const profileId =
    session.isAdmin && requestedPerson ? requestedPerson : session.userId;

  const days = weekDays(weekStart);
  const rangeStart = new Date(`${weekStart}T00:00:00Z`);
  const rangeEnd = new Date(`${addDays(weekStart, DAYS_IN_WEEK - 1)}T00:00:00Z`);

  const [projects, entries, people] = await Promise.all([
    prisma.project.findMany({
      where: {
        OR: [
          { status: { in: ["active", "on_hold"] } },
          // Keep a row visible if this person already logged against it,
          // even once the project has been completed or archived.
          {
            time_entries: {
              some: {
                profile_id: profileId,
                work_date: { gte: rangeStart, lte: rangeEnd },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        company: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        profile_id: profileId,
        work_date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { project_id: true, work_date: true, hours: true },
    }),
    session.isAdmin
      ? prisma.profile.findMany({
          where: { is_active: true },
          select: { id: true, full_name: true, email: true },
          orderBy: { full_name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const gridProjects: GridProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    companyName: p.company?.name ?? null,
  }));

  const initialHours: HoursMap = {};
  for (const entry of entries) {
    const key = `${entry.project_id}:${entry.work_date.toISOString().slice(0, 10)}`;
    initialHours[key] = Number(entry.hours);
  }

  const viewingSelf = profileId === session.userId;
  const viewedPerson = people.find((p) => p.id === profileId);

  return (
    <div>
      <PageHeader
        title="Timesheet"
        description={
          viewingSelf
            ? "Log hours per project. Type 7, 7.5 or 7:30 — it saves as you go."
            : `Viewing ${viewedPerson ? displayName(viewedPerson) : "another employee"}'s week.`
        }
      />

      <TimesheetToolbar
        weekStart={weekStart}
        previousWeekStart={addDays(weekStart, -DAYS_IN_WEEK)}
        nextWeekStart={addDays(weekStart, DAYS_IN_WEEK)}
        currentWeekStart={currentWeekStart()}
        rangeLabel={weekRangeLabel(weekStart)}
        profileId={profileId}
        people={people.map((p) => ({ id: p.id, name: displayName(p) }))}
        canSwitchPerson={session.isAdmin}
        readOnly={false}
      />

      <TimesheetGrid
        projects={gridProjects}
        days={days}
        initialHours={initialHours}
        profileId={profileId}
      />
    </div>
  );
}
