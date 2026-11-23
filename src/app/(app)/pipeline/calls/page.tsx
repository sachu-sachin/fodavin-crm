import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/auth";
import { formatDateKey, istDateKey, istToday } from "@/lib/format";
import { CALL_OUTCOME_LABELS } from "@/lib/calls";
import { BUCKET_LABELS, BUCKET_ORDER, callTally, sortQueue } from "@/lib/call-list";
import { INQUIRY_STAGES, OPEN_INQUIRY_STAGES } from "@/lib/types";
import { getWorkRules } from "@/lib/attendance-data";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ImportLeadsDialog, QuickLog } from "@/components/call-list-client";

export const dynamic = "force-dynamic";

const MAX_ROWS = 300;
const IST = "+05:30";
const stageLabel = Object.fromEntries(INQUIRY_STAGES.map((s) => [s.value, s.label]));
type Who = "mine" | "unassigned" | "all";

export default async function CallListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePermission("pipeline.manage");
  const raw = (await searchParams).who;
  const who: Who = raw === "all" || raw === "unassigned" ? raw : "mine";
  const today = istToday();

  const ownerWhere =
    who === "mine" ? { owner_id: session.userId } : who === "unassigned" ? { owner_id: null } : {};
  const [leads, myCallsToday, people, rules] = await Promise.all([
    prisma.inquiry.findMany({
      where: { stage: { in: OPEN_INQUIRY_STAGES }, ...ownerWhere },
      select: {
        id: true,
        title: true,
        contact_name: true,
        phone: true,
        stage: true,
        next_follow_up: true,
        created_at: true,
        contact: { select: { full_name: true, phone: true } },
        owner: { select: { full_name: true } },
        _count: { select: { calls: true } },
        calls: { orderBy: { called_at: "desc" }, take: 1, select: { outcome: true, called_at: true, notes: true } },
      },
      take: 2000,
    }),
    prisma.callLog.findMany({
      where: {
        logged_by: session.userId,
        called_at: { gte: new Date(`${today}T00:00:00${IST}`), lte: new Date(`${today}T23:59:59${IST}`) },
      },
      select: { outcome: true },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { full_name: "asc" },
    }),
    getWorkRules(),
  ]);

  const queue = sortQueue(
    leads.map((l) => ({
      ...l,
      next_follow_up: l.next_follow_up ? l.next_follow_up.toISOString().slice(0, 10) : null,
      created_at: l.created_at.toISOString(),
      last_call: l.calls[0] ?? null,
      calls: l._count.calls,
    })),
    today,
  );
  const shown = queue.slice(0, MAX_ROWS);
  const tally = callTally(myCallsToday.map((c) => c.outcome));
  const target = rules.dailyCallTarget;
  const counts = Object.fromEntries(BUCKET_ORDER.map((b) => [b, queue.filter((q) => q.bucket === b).length]));
  const owners = people.map((p) => ({ id: p.id, name: p.full_name || p.email?.split("@")[0] || "User" }));

  return (
    <div>
      <PageHeader
        title="Call list"
        description="Your open leads in the order to call them: overdue follow-ups, today's, then new leads never called."
      >
        <ImportLeadsDialog owners={owners} currentUserId={session.userId} />
        <Link href="/pipeline" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          Board
        </Link>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">My calls today</div>
            <div className="text-2xl font-semibold" data-testid="calls-today">
              {tally.total}
              {target > 0 && <span className="text-base font-normal text-muted-foreground"> / {target}</span>}
            </div>
            {target > 0 && (
              <div className="mt-1 h-1.5 rounded bg-muted">
                <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, (tally.total / target) * 100)}%` }} />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-sm">
            <div className="text-xs text-muted-foreground">Today&apos;s outcomes</div>
            {tally.total === 0 ? (
              <div className="text-muted-foreground">No calls yet</div>
            ) : (
              <div className="flex flex-wrap gap-x-3">
                {Object.entries(tally.by)
                  .filter(([, n]) => n > 0)
                  .map(([o, n]) => (
                    <span key={o}>
                      {CALL_OUTCOME_LABELS[o as keyof typeof CALL_OUTCOME_LABELS]} {n}
                    </span>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="py-3 text-sm">
            <div className="text-xs text-muted-foreground">To call</div>
            <div className="flex flex-wrap gap-x-4">
              <span className="font-medium text-destructive">Overdue {counts.overdue}</span>
              <span>Today {counts.today}</span>
              <span>Never called {counts.new}</span>
              <span className="text-muted-foreground">Later {counts.later + counts.no_date}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <nav className="mb-3 flex gap-1 text-sm" aria-label="Whose leads">
        {(
          [
            ["mine", "My leads"],
            ["unassigned", "Unassigned"],
            ...(can(session, "pipeline.view") ? [["all", "Everyone's"]] : []),
          ] as [Who, string][]
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/pipeline/calls?who=${k}`}
            aria-current={who === k ? "page" : undefined}
            className={`rounded-md border px-3 py-1 ${who === k ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No open leads here. Import a list or add leads on the board.
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.filter((b) => shown.some((q) => q.bucket === b)).map((b) => (
            <section key={b}>
              <h2 className={`mb-2 text-sm font-semibold ${b === "overdue" ? "text-destructive" : ""}`}>
                {BUCKET_LABELS[b]} ({counts[b]})
              </h2>
              <div className="divide-y rounded-lg border bg-card">
                {shown
                  .filter((q) => q.bucket === b)
                  .map((l) => {
                    const phone = l.phone ?? l.contact?.phone ?? null;
                    const person = l.contact?.full_name ?? l.contact_name;
                    const last = l.last_call;
                    return (
                      <div key={l.id} className="grid gap-2 p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-lead={l.title}>
                        <div className="min-w-0 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/pipeline/${l.id}`} className="truncate font-medium hover:underline">
                              {l.title}
                            </Link>
                            <Badge variant="secondary">{stageLabel[l.stage]}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                            {person && <span>{person}</span>}
                            {phone && (
                              <a href={`tel:${phone}`} className="font-medium text-primary hover:underline">
                                {phone}
                              </a>
                            )}
                            {l.next_follow_up && <span>Follow up {formatDateKey(l.next_follow_up)}</span>}
                            {who !== "mine" && <span>{l.owner?.full_name ?? "Unassigned"}</span>}
                          </div>
                          {last && (
                            <div className="truncate text-xs text-muted-foreground">
                              Last: {CALL_OUTCOME_LABELS[last.outcome]} · {formatDateKey(istDateKey(last.called_at))}
                              {last.notes ? ` · ${last.notes}` : ""} ({l.calls} call{l.calls === 1 ? "" : "s"})
                            </div>
                          )}
                        </div>
                        <QuickLog inquiryId={l.id} title={l.title} />
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
          {queue.length > MAX_ROWS && (
            <p className="text-sm text-muted-foreground">
              Showing the first {MAX_ROWS} of {queue.length}. Work through these and the rest move up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
