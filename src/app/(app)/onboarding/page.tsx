import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/auth";
import { formatDateKey, istToday } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StartOnboardingDialog } from "@/components/start-onboarding-dialog";
import { StarterTemplateButton } from "@/components/starter-template-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (p: { full_name: string | null; email: string | null }) =>
  p.full_name || p.email?.split("@")[0] || "User";

export default async function OnboardingPage() {
  const session = await requirePermission("onboarding.view");
  const canManage = can(session, "onboarding.manage");
  const today = istToday();
  const todayDate = new Date(today);

  const [onboardings, templates, available] = await Promise.all([
    prisma.onboarding.findMany({
      select: {
        id: true,
        start_date: true,
        profile: { select: { full_name: true, email: true, is_active: true } },
        template: { select: { name: true } },
        _count: {
          select: {
            tasks: true,
          },
        },
        tasks: {
          where: { status: { not: "done" } },
          select: { due_date: true },
        },
      },
      orderBy: { start_date: "desc" },
    }),
    canManage
      ? prisma.onboardingTemplate.findMany({
          select: { id: true, name: true, _count: { select: { items: true } } },
          orderBy: { name: "asc" },
        })
      : [],
    canManage
      ? prisma.profile.findMany({
          where: { is_active: true, onboarding: null },
          select: { id: true, full_name: true, email: true },
          orderBy: { created_at: "desc" },
        })
      : [],
  ]);

  const rows = onboardings.map((o) => {
    const open = o.tasks.length;
    const total = o._count.tasks;
    return {
      id: o.id,
      name: nameOf(o.profile),
      left: !o.profile.is_active,
      template: o.template?.name ?? null,
      startDate: dateStr(o.start_date),
      total,
      done: total - open,
      overdue: o.tasks.filter((t) => t.due_date && t.due_date < todayDate).length,
    };
  });
  const inProgress = rows.filter((r) => r.done < r.total);
  const finished = rows.filter((r) => r.total > 0 && r.done === r.total);
  const usableTemplates = templates
    .filter((t) => t._count.items > 0)
    .map((t) => ({ id: t.id, name: t.name, steps: t._count.items }));

  return (
    <div>
      <PageHeader
        title="Onboarding"
        description="New joiners' checklists — each step is a task with an owner and a due date."
      >
        {canManage && (
          <>
            <Button variant="outline" render={<Link href="/onboarding/templates" />}>
              Templates
            </Button>
            {usableTemplates.length > 0 && (
              <StartOnboardingDialog
                people={available.map((p) => ({ id: p.id, name: nameOf(p) }))}
                templates={usableTemplates}
                today={today}
                trigger={<Button>Start onboarding</Button>}
              />
            )}
          </>
        )}
      </PageHeader>

      {canManage && usableTemplates.length === 0 && (
        <div className="mb-6 rounded-lg border border-dashed bg-card p-6 text-center">
          <p className="text-sm font-medium">No checklist templates yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start from a ready-made developer checklist, or build your own under Templates.
          </p>
          <div className="mt-4 flex justify-center">
            <StarterTemplateButton variant="default" />
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">In progress</h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is being onboarded right now.</p>
        ) : (
          inProgress.map((r) => <OnboardingRow key={r.id} row={r} />)
        )}
      </section>

      {finished.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Completed</h2>
          {finished.map((r) => (
            <OnboardingRow key={r.id} row={r} />
          ))}
        </section>
      )}
    </div>
  );
}

function OnboardingRow({
  row,
}: {
  row: {
    id: string;
    name: string;
    left: boolean;
    template: string | null;
    startDate: string;
    total: number;
    done: number;
    overdue: number;
  };
}) {
  const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
  return (
    <Link href={`/onboarding/${row.id}`}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.name}
              {row.left && <span className="ml-2 text-xs text-muted-foreground">(left)</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              Starts {formatDateKey(row.startDate)}
              {row.template && ` · ${row.template}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {row.overdue > 0 && (
              <span className="text-xs font-medium text-destructive">
                {row.overdue} overdue
              </span>
            )}
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-24 text-right text-sm text-muted-foreground">
              {row.done} of {row.total} done
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
