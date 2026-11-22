import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionProfile } from "@/lib/auth";
import { formatDateKey, formatTimeIST, istToday } from "@/lib/format";
import { addDays } from "@/lib/week";
import { hhmmToMinutes, istMinutesOfDay } from "@/lib/attendance";
import { getWorkRules } from "@/lib/attendance-data";
import { reviewablePeople } from "@/lib/reports-data";
import { hoursVariance, PRIORITY_LABELS } from "@/lib/task-timing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EodReportForm,
  MorningReportForm,
  ReviewForm,
  type PickTask,
} from "@/components/report-forms";

export const dynamic = "force-dynamic";

const dbDate = (key: string) => new Date(`${key}T00:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const IST = "+05:30";

type Report = {
  id: string;
  kind: "morning" | "eod";
  report_date: Date;
  plan: string | null;
  completed: string | null;
  pending: string | null;
  blockers: string | null;
  task_ids: string[];
  submitted_at: Date;
  review_note: string | null;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const params = await searchParams;
  const today = istToday();
  const people = await reviewablePeople(session);
  const tab = params.tab === "team" && people.length ? "team" : "me";
  const rawDate = typeof params.date === "string" ? params.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today;
  const rules = await getWorkRules();

  return (
    <div>
      <PageHeader
        title="Daily reports"
        description={`Morning plan after the ${rules.morningMeeting} meeting, end-of-day report after the ${rules.eodMeeting} meeting.`}
      />
      {people.length > 0 && (
        <nav className="mb-6 flex gap-1 border-b" aria-label="Report sections">
          {[
            { key: "me", label: "My reports" },
            { key: "team", label: "Team reports" },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                t.key === tab ? "border-primary font-medium" : "border-transparent text-muted-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {tab === "me" ? (
        <MyReports userId={session.userId} today={today} />
      ) : (
        <TeamReports people={people} date={date} today={today} morningDue={rules.morningMeeting} eodDue={rules.eodMeeting} />
      )}
    </div>
  );
}

async function MyReports({ userId, today }: { userId: string; today: string }) {
  const [openTasks, reports] = await Promise.all([
    prisma.task.findMany({
      where: { assignee_id: userId, status: { not: "done" } },
      select: {
        id: true,
        title: true,
        allocated_hours: true,
        project: { select: { name: true } },
        workstream: true,
      },
      orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
    }),
    prisma.dailyReport.findMany({
      where: { profile_id: userId, report_date: { gte: dbDate(addDays(today, -14)) } },
      orderBy: [{ report_date: "desc" }, { kind: "asc" }],
    }),
  ]);
  const pick: PickTask[] = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    context: t.project?.name ?? t.workstream ?? "Individual",
    allocated: t.allocated_hours == null ? null : Number(t.allocated_hours),
  }));
  const morning = reports.find((r) => keyOf(r.report_date) === today && r.kind === "morning");
  const eod = reports.find((r) => keyOf(r.report_date) === today && r.kind === "eod");
  // Today's planned tasks first in the EOD list.
  const planned = new Set(morning?.task_ids ?? []);
  const eodTasks = [...pick].sort((a, b) => Number(planned.has(b.id)) - Number(planned.has(a.id)));
  const history = reports.filter((r) => keyOf(r.report_date) !== today);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Morning plan · {formatDateKey(today)}</CardTitle>
            {morning && <Badge variant="secondary">Submitted {formatTimeIST(morning.submitted_at.toISOString())}</Badge>}
          </CardHeader>
          <CardContent>
            <MorningReportForm tasks={pick} plan={morning?.plan ?? ""} picked={morning?.task_ids ?? []} submitted={!!morning} />
            {morning?.review_note && <LeadComment note={morning.review_note} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">End-of-day report</CardTitle>
            {eod && <Badge variant="secondary">Submitted {formatTimeIST(eod.submitted_at.toISOString())}</Badge>}
          </CardHeader>
          <CardContent>
            <EodReportForm
              tasks={eodTasks}
              completed={eod?.completed ?? ""}
              pendingText={eod?.pending ?? ""}
              blockers={eod?.blockers ?? ""}
              submitted={!!eod}
            />
            {eod?.review_note && <LeadComment note={eod.review_note} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Last two weeks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 && <p className="text-sm text-muted-foreground">No earlier reports yet.</p>}
          {history.map((r) => (
            <div key={r.id} className="border-b pb-3 text-sm last:border-0">
              <div className="font-medium">
                {formatDateKey(keyOf(r.report_date))} · {r.kind === "morning" ? "Morning plan" : "EOD report"}
              </div>
              <ReportBody r={r} titles={new Map()} />
              {r.review_note && <LeadComment note={r.review_note} />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function TeamReports({
  people,
  date,
  today,
  morningDue,
  eodDue,
}: {
  people: { id: string; name: string }[];
  date: string;
  today: string;
  morningDue: string;
  eodDue: string;
}) {
  const ids = people.map((p) => p.id);
  const dayStart = new Date(`${date}T00:00:00${IST}`);
  const dayEnd = new Date(`${date}T23:59:59${IST}`);
  const [reports, doneToday, openCounts] = await Promise.all([
    prisma.dailyReport.findMany({ where: { profile_id: { in: ids }, report_date: dbDate(date) } }),
    prisma.task.findMany({
      where: { assignee_id: { in: ids }, completed_at: { gte: dayStart, lte: dayEnd } },
      select: { id: true, title: true, assignee_id: true, allocated_hours: true, actual_hours: true, priority: true },
    }),
    prisma.task.groupBy({
      by: ["assignee_id"],
      where: { assignee_id: { in: ids }, status: { not: "done" } },
      _count: true,
    }),
  ]);
  const plannedIds = [...new Set(reports.flatMap((r) => r.task_ids))];
  const plannedTasks = plannedIds.length
    ? await prisma.task.findMany({ where: { id: { in: plannedIds } }, select: { id: true, title: true, status: true } })
    : [];
  const titles = new Map(plannedTasks.map((t) => [t.id, `${t.title}${t.status === "done" ? " ✓" : ""}`]));
  const open = new Map(openCounts.map((c) => [c.assignee_id, c._count]));
  const morningCount = reports.filter((r) => r.kind === "morning").length;
  const eodCount = reports.filter((r) => r.kind === "eod").length;

  // Late: submitted more than an hour after its meeting, on the day itself.
  const late = (r: Report) =>
    keyOf(r.report_date) === date &&
    istMinutesOfDay(r.submitted_at) > hhmmToMinutes(r.kind === "morning" ? morningDue : eodDue) + 60;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{formatDateKey(date)}</span> · morning plans {morningCount}/{people.length} · EOD
          reports {eodCount}/{people.length}
        </p>
        <div className="flex gap-1 text-sm">
          <Link className="rounded border px-2 py-1" href={`/reports?tab=team&date=${addDays(date, -1)}`}>
            ← Previous day
          </Link>
          {date !== today && (
            <Link className="rounded border px-2 py-1" href={`/reports?tab=team&date=${addDays(date, 1)}`}>
              Next day →
            </Link>
          )}
        </div>
      </div>
      {people.map((p) => {
        const morning = reports.find((r) => r.profile_id === p.id && r.kind === "morning");
        const eod = reports.find((r) => r.profile_id === p.id && r.kind === "eod");
        const done = doneToday.filter((t) => t.assignee_id === p.id);
        return (
          <Card key={p.id} data-person={p.name}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {open.get(p.id) ?? 0} open task(s) · {done.length} finished this day
              </span>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                { label: "Morning plan", r: morning },
                { label: "EOD report", r: eod },
              ].map(({ label, r }) => (
                <div key={label} className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {label}
                    {r ? (
                      <Badge variant={late(r) ? "outline" : "secondary"}>
                        {formatTimeIST(r.submitted_at.toISOString())}
                        {late(r) ? " · late" : ""}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Not submitted</Badge>
                    )}
                  </div>
                  {r && <ReportBody r={r} titles={titles} />}
                  {r && <ReviewForm id={r.id} note={r.review_note ?? ""} />}
                </div>
              ))}
              {done.length > 0 && (
                <div className="md:col-span-2">
                  <div className="mb-1 text-sm font-medium">Finished this day</div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 font-medium">Task</th>
                        <th className="py-1 font-medium">Priority</th>
                        <th className="py-1 font-medium">Allocated</th>
                        <th className="py-1 font-medium">Actual</th>
                        <th className="py-1 font-medium">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {done.map((t) => {
                        const a = t.allocated_hours == null ? null : Number(t.allocated_hours);
                        const x = t.actual_hours == null ? null : Number(t.actual_hours);
                        const v = hoursVariance(a, x);
                        return (
                          <tr key={t.id} className="border-t">
                            <td className="py-1">{t.title}</td>
                            <td className="py-1">{PRIORITY_LABELS[t.priority]}</td>
                            <td className="py-1">{a ?? "—"}</td>
                            <td className="py-1">{x ?? "—"}</td>
                            <td className={`py-1 ${v != null && v < 0 ? "text-destructive" : ""}`}>{v ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReportBody({ r, titles }: { r: Report; titles: Map<string, string> }) {
  const lines: [string, string | null][] =
    r.kind === "morning"
      ? [["Plan", r.plan]]
      : [
          ["Completed", r.completed],
          ["Pending", r.pending],
          ["Blockers", r.blockers],
        ];
  const taskTitles = r.task_ids.map((id) => titles.get(id)).filter(Boolean);
  return (
    <div className="space-y-1">
      {lines
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <p key={k} className="whitespace-pre-wrap">
            <span className="text-muted-foreground">{k}: </span>
            {v}
          </p>
        ))}
      {taskTitles.length > 0 && (
        <p>
          <span className="text-muted-foreground">{r.kind === "morning" ? "Tasks: " : "Ticked off: "}</span>
          {taskTitles.join(", ")}
        </p>
      )}
    </div>
  );
}

function LeadComment({ note }: { note: string }) {
  return (
    <p className="mt-3 rounded-md bg-muted p-2 text-sm">
      <span className="font-medium">Lead&apos;s comment: </span>
      {note}
    </p>
  );
}
