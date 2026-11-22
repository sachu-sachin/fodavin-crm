import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { formatDateKey, formatTimeIST, istToday, monthYearLabel } from "@/lib/format";
import { addDays } from "@/lib/week";
import {
  dayMetrics,
  istHHmm,
  isWorkingDay,
  LEAVE_TYPE_LABELS,
  monthKeys,
  monthSummary,
  parseMonthParam,
  STATUS_META,
  type DayRecord,
  type LeaveType,
  type MonthSummary,
  type WorkRules,
} from "@/lib/attendance";
import { getHolidayKeys, getWorkRules, visiblePeople } from "@/lib/attendance-data";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckInCard,
  DeleteHolidayButton,
  HolidayForm,
  LeaveDecisionForm,
  LeaveRequestForm,
  RegisterRowForm,
  WithdrawLeaveButton,
  WorkSettingsForm,
} from "@/components/attendance-forms";

export const dynamic = "force-dynamic";

type Tab = "me" | "team" | "summary" | "settings";
const dbDate = (key: string) => new Date(`${key}T00:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);

  const today = istToday();
  const people = await visiblePeople(session);
  const canSettings = can(session, "attendance.manage_all");
  const tabs: { key: Tab; label: string }[] = [
    { key: "me", label: "My attendance" },
    ...(people.length ? [{ key: "team" as Tab, label: "Team register" }] : []),
    ...(people.length ? [{ key: "summary" as Tab, label: "Monthly summary" }] : []),
    ...(canSettings ? [{ key: "settings" as Tab, label: "Office hours & holidays" }] : []),
  ];
  const requested = str("tab") as Tab | undefined;
  const tab: Tab = tabs.some((t) => t.key === requested) ? requested! : "me";

  const ym = parseMonthParam(str("month")) ?? {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  const monthParam = `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const rules = await getWorkRules();

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Check in and out, see your days, and request leave. Leads mark their team here."
      />
      <nav className="mb-6 flex flex-wrap gap-1 border-b" aria-label="Attendance sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/attendance?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              t.key === tab
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "me" && (
        <MyAttendance userId={session.userId} today={today} ym={ym} monthParam={monthParam} rules={rules} />
      )}
      {tab === "team" && (
        <TeamRegister
          people={people}
          date={/^\d{4}-\d{2}-\d{2}$/.test(str("date") ?? "") && str("date")! <= today ? str("date")! : today}
          today={today}
          rules={rules}
        />
      )}
      {tab === "summary" && (
        <TeamSummary people={people} today={today} ym={ym} monthParam={monthParam} rules={rules} />
      )}
      {tab === "settings" && canSettings && <SettingsTab rules={rules} today={today} />}
    </div>
  );
}

// -- My attendance -------------------------------------------------------------

async function MyAttendance({
  userId,
  today,
  ym,
  monthParam,
  rules,
}: {
  userId: string;
  today: string;
  ym: { year: number; month: number };
  monthParam: string;
  rules: WorkRules;
}) {
  const keys = monthKeys(ym.year, ym.month);
  const [rows, holidays, leaves, todayRow] = await Promise.all([
    prisma.attendance.findMany({
      where: { profile_id: userId, work_date: { gte: dbDate(keys[0]), lte: dbDate(keys.at(-1)!) } },
      select: { work_date: true, check_in: true, check_out: true, status: true, remarks: true },
    }),
    getHolidayKeys(keys[0], keys.at(-1)!),
    prisma.leaveRequest.findMany({
      where: { profile_id: userId },
      orderBy: { start_date: "desc" },
      take: 20,
    }),
    prisma.attendance.findUnique({
      where: { profile_id_work_date: { profile_id: userId, work_date: dbDate(today) } },
      select: { check_in: true, check_out: true, status: true },
    }),
  ]);

  const records = new Map<string, DayRecord & { remarks: string | null }>(
    rows.map((r) => [keyOf(r.work_date), { check_in: r.check_in, check_out: r.check_out, status: r.status, remarks: r.remarks }]),
  );
  const summary = monthSummary(keys, records, rules, holidays, today);
  const shown = keys.filter((k) => k <= today).reverse();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <CheckInCard
          checkInLabel={todayRow?.check_in ? formatTimeIST(todayRow.check_in.toISOString()) : null}
          checkOutLabel={todayRow?.check_out ? formatTimeIST(todayRow.check_out.toISOString()) : null}
          statusLabel={todayRow?.status ? STATUS_META[todayRow.status].label : null}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">{monthYearLabel(ym.year, ym.month - 1)}</CardTitle>
            <MonthNav tab="me" monthParam={monthParam} />
          </CardHeader>
          <CardContent>
            <SummaryTiles s={summary} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">In</th>
                    <th className="p-2 font-medium">Out</th>
                    <th className="p-2 font-medium">Hours</th>
                    <th className="p-2 font-medium">Late</th>
                    <th className="p-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((k) => {
                    const r = records.get(k);
                    const m = r ? dayMetrics(r, rules) : null;
                    const working = isWorkingDay(k, rules.weeklyOffs, holidays);
                    return (
                      <tr key={k} className="border-t">
                        <td className="p-2 whitespace-nowrap">{formatDateKey(k)}</td>
                        <td className="p-2">
                          <StatusBadge status={m?.status ?? null} working={working} holiday={holidays.has(k)} />
                        </td>
                        <td className="p-2">{r?.check_in ? formatTimeIST(r.check_in.toISOString()) : ""}</td>
                        <td className="p-2">{r?.check_out ? formatTimeIST(r.check_out.toISOString()) : ""}</td>
                        <td className="p-2">{m?.hours ?? ""}</td>
                        <td className="p-2">{m?.lateMinutes ? `${m.lateMinutes} min` : ""}</td>
                        <td className="p-2 text-muted-foreground">{r?.remarks ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Request leave</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestForm today={today} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My leave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leaves.length === 0 && <p className="text-sm text-muted-foreground">No leave requested yet.</p>}
            {leaves.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <div>
                  <div className="font-medium">
                    {LEAVE_TYPE_LABELS[l.type as LeaveType]}
                    {l.half_day ? " (half day)" : ""}
                  </div>
                  <div className="text-muted-foreground">{leaveRange(l.start_date, l.end_date)}</div>
                  {l.decision_note && <div className="text-muted-foreground">“{l.decision_note}”</div>}
                </div>
                <div className="flex items-center gap-1">
                  <LeaveStatusBadge status={l.status} />
                  {l.status === "pending" && <WithdrawLeaveButton id={l.id} />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -- Team register ---------------------------------------------------------------

async function TeamRegister({
  people,
  date,
  today,
  rules,
}: {
  people: { id: string; name: string; canEdit: boolean }[];
  date: string;
  today: string;
  rules: WorkRules;
}) {
  const ids = people.map((p) => p.id);
  const editable = new Set(people.filter((p) => p.canEdit).map((p) => p.id));
  const [rows, holidays, pending] = await Promise.all([
    prisma.attendance.findMany({
      where: { profile_id: { in: ids }, work_date: dbDate(date) },
      select: { profile_id: true, check_in: true, check_out: true, status: true, remarks: true },
    }),
    getHolidayKeys(date, date),
    prisma.leaveRequest.findMany({
      where: {
        profile_id: { in: [...editable] },
        OR: [{ status: "pending" }, { status: "approved", end_date: { gte: dbDate(today) } }],
      },
      include: { profile: { select: { full_name: true, email: true } } },
      orderBy: { start_date: "asc" },
    }),
  ]);
  const byPerson = new Map(rows.map((r) => [r.profile_id, r]));
  const working = isWorkingDay(date, rules.weeklyOffs, holidays);
  const marked = people.filter((p) => {
    const r = byPerson.get(p.id);
    return r && (r.check_in || r.status);
  }).length;

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leave requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm last:border-0">
                <div>
                  <span className="font-medium">
                    {l.profile.full_name || l.profile.email?.split("@")[0]}
                  </span>{" "}
                  · {LEAVE_TYPE_LABELS[l.type as LeaveType]}
                  {l.half_day ? " (half day)" : ""} · {leaveRange(l.start_date, l.end_date)}
                  {l.reason && <div className="text-muted-foreground">{l.reason}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <LeaveStatusBadge status={l.status} />
                  <LeaveDecisionForm id={l.id} approved={l.status === "approved"} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">
            {formatDateKey(date)} · {marked}/{people.length} marked
            {!working && <span className="ml-2 text-sm font-normal text-muted-foreground">(not a working day)</span>}
          </CardTitle>
          <div className="flex items-center gap-1 text-sm">
            <Link className="rounded border px-2 py-1" href={`/attendance?tab=team&date=${addDays(date, -1)}`}>
              ← Previous day
            </Link>
            {date !== today && (
              <>
                <Link className="rounded border px-2 py-1" href={`/attendance?tab=team&date=${addDays(date, 1)}`}>
                  Next day →
                </Link>
                <Link className="rounded border px-2 py-1" href="/attendance?tab=team">
                  Today
                </Link>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Person</th>
                <th className="p-2 font-medium">Check-in</th>
                <th className="p-2 font-medium">Check-out</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Remarks</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const r = byPerson.get(p.id);
                const m = r ? dayMetrics(r, rules) : null;
                const hint = [
                  m?.hours != null ? `${m.hours} h` : null,
                  m?.lateMinutes ? `late ${m.lateMinutes} min` : null,
                  m?.earlyMinutes ? `left ${m.earlyMinutes} min early` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={p.id} className="border-t align-middle">
                    <td className="p-2">
                      <div className="font-medium">{p.name}</div>
                      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
                    </td>
                    {p.canEdit ? (
                      <RegisterRowForm
                        // Keyed by person and day only: remounting on saved
                        // values would drop the save's result before it shows.
                        key={`${p.id}-${date}`}
                        profileId={p.id}
                        date={date}
                        checkIn={istHHmm(r?.check_in)}
                        checkOut={istHHmm(r?.check_out)}
                        status={r?.status ?? ""}
                        remarks={r?.remarks ?? ""}
                      />
                    ) : (
                      <>
                        <td className="p-2">{r?.check_in ? formatTimeIST(r.check_in.toISOString()) : "—"}</td>
                        <td className="p-2">{r?.check_out ? formatTimeIST(r.check_out.toISOString()) : "—"}</td>
                        <td className="p-2">
                          <StatusBadge status={m?.status ?? null} working={working} holiday={holidays.has(date)} />
                        </td>
                        <td className="p-2 text-muted-foreground">{r?.remarks ?? ""}</td>
                        <td />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            “Auto” means present once they check in. Office hours {rules.shiftStart}–{rules.shiftEnd}, late after{" "}
            {rules.lateGraceMinutes} minutes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// -- Monthly summary --------------------------------------------------------------

async function TeamSummary({
  people,
  today,
  ym,
  monthParam,
  rules,
}: {
  people: { id: string; name: string }[];
  today: string;
  ym: { year: number; month: number };
  monthParam: string;
  rules: WorkRules;
}) {
  const keys = monthKeys(ym.year, ym.month);
  const [rows, holidays] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        profile_id: { in: people.map((p) => p.id) },
        work_date: { gte: dbDate(keys[0]), lte: dbDate(keys.at(-1)!) },
      },
      select: { profile_id: true, work_date: true, check_in: true, check_out: true, status: true },
    }),
    getHolidayKeys(keys[0], keys.at(-1)!),
  ]);
  const byPerson = new Map<string, Map<string, DayRecord>>();
  for (const r of rows) {
    if (!byPerson.has(r.profile_id)) byPerson.set(r.profile_id, new Map());
    byPerson.get(r.profile_id)!.set(keyOf(r.work_date), r);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{monthYearLabel(ym.year, ym.month - 1)}</CardTitle>
        <MonthNav tab="summary" monthParam={monthParam} />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {["Person", "Present eq.", "Absent", "Half days", "WFH", "Leave", "LWP", "Missing", "Late days", "Hours", "Attendance"].map((h) => (
                <th key={h} className="p-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const s = monthSummary(keys, byPerson.get(p.id) ?? new Map(), rules, holidays, today);
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{s.presentEquivalent}</td>
                  <td className="p-2">{s.absent}</td>
                  <td className="p-2">{s.halfDays}</td>
                  <td className="p-2">{s.remote}</td>
                  <td className="p-2">{s.paidLeave}</td>
                  <td className="p-2">{s.unpaidLeave}</td>
                  <td className="p-2">{s.missing}</td>
                  <td className="p-2">{s.lateDays}</td>
                  <td className="p-2">{s.totalHours}</td>
                  <td className="p-2 font-medium">{pct(s.percent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Present eq. counts P, OD and WFH as 1 and half days as 0.5. Attendance % is present eq. ÷ working days so
          far, with paid leave left out. “Missing” is a working day with nothing recorded.
        </p>
      </CardContent>
    </Card>
  );
}

// -- Settings ---------------------------------------------------------------------

async function SettingsTab({ rules, today }: { rules: WorkRules; today: string }) {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: dbDate(`${today.slice(0, 4)}-01-01`) } },
    orderBy: { date: "asc" },
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Office hours</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkSettingsForm
            shiftStart={rules.shiftStart}
            shiftEnd={rules.shiftEnd}
            grace={rules.lateGraceMinutes}
            hours={rules.standardHours}
            weeklyOffs={rules.weeklyOffs}
            morningMeeting={rules.morningMeeting}
            eodMeeting={rules.eodMeeting}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Holidays</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <HolidayForm />
          <div className="space-y-1">
            {holidays.length === 0 && <p className="text-sm text-muted-foreground">No holidays added for this year.</p>}
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b py-1 text-sm last:border-0">
                <span>
                  {formatDateKey(keyOf(h.date))} · {h.name}
                </span>
                <DeleteHolidayButton id={h.id} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -- Small pieces -----------------------------------------------------------------

function MonthNav({ tab, monthParam }: { tab: Tab; monthParam: string }) {
  const [y, m] = monthParam.split("-").map(Number);
  const shift = (d: number) => {
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <div className="flex gap-1 text-sm">
      <Link className="rounded border px-2 py-1" href={`/attendance?tab=${tab}&month=${shift(-1)}`}>
        ← Previous
      </Link>
      <Link className="rounded border px-2 py-1" href={`/attendance?tab=${tab}&month=${shift(1)}`}>
        Next →
      </Link>
    </div>
  );
}

function SummaryTiles({ s }: { s: MonthSummary }) {
  const tiles = [
    ["Attendance", pct(s.percent)],
    ["Present eq.", s.presentEquivalent],
    ["Leave", s.paidLeave + s.unpaidLeave],
    ["Late days", s.lateDays],
    ["Hours", s.totalHours],
    ["Missing", s.missing],
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
  working,
  holiday,
}: {
  status: keyof typeof STATUS_META | null;
  working: boolean;
  holiday: boolean;
}) {
  if (status) {
    const meta = STATUS_META[status];
    const variant = meta.bucket === "absent" ? "destructive" : meta.weight > 0 ? "secondary" : "outline";
    return (
      <Badge variant={variant} title={meta.label}>
        {meta.code} · {meta.label}
      </Badge>
    );
  }
  if (holiday) return <span className="text-muted-foreground">Holiday</span>;
  if (!working) return <span className="text-muted-foreground">Weekly off</span>;
  return <span className="text-muted-foreground">Not marked</span>;
}

function LeaveStatusBadge({ status }: { status: string }) {
  const variant = status === "approved" ? "secondary" : status === "rejected" ? "destructive" : "outline";
  return <Badge variant={variant}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

function leaveRange(start: Date, end: Date): string {
  const a = keyOf(start);
  const b = keyOf(end);
  return a === b ? formatDateKey(a) : `${formatDateKey(a)} – ${formatDateKey(b)}`;
}
