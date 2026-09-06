import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { MILESTONE_STATUSES, type MilestoneStatus } from "@/lib/types";
import { formatDateKey, formatINR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) =>
  d ? formatDateKey(d.toISOString().slice(0, 10)) : null;

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("finance.view");

  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const projectId = typeof params.project === "string" ? params.project : undefined;

  const where: Prisma.PaymentMilestoneWhereInput = {
    ...(status ? { status: status as MilestoneStatus } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  };

  const [milestones, projects, allForChart] = await Promise.all([
    prisma.paymentMilestone.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, company: { select: { name: true } } } },
      },
      orderBy: { due_date: { sort: "asc", nulls: "last" } },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.paymentMilestone.groupBy({
      by: ["status"],
      _sum: { amount: true },
    }),
  ]);

  const amountByStatus = new Map(
    allForChart.map((g) => [g.status, Number(g._sum.amount ?? 0)]),
  );
  const chartData = MILESTONE_STATUSES.map((s) => ({
    label: s.label,
    value: amountByStatus.get(s.value) ?? 0,
  })).filter((d) => d.value > 0);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (projectId) exportParams.set("project", projectId);
  const hasFilters = !!(status || projectId);

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Payment milestones and invoices across every project."
      />

      {chartData.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Amount by status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>
      )}

      <ListFilterBar
        filters={[
          { key: "status", label: "Status", options: MILESTONE_STATUSES },
          {
            key: "project",
            label: "Project",
            options: projects.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
        exportHref={`/api/reports/finance?${exportParams.toString()}`}
      />

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            {hasFilters ? "No milestones match these filters" : "No payment milestones yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try clearing a filter."
              : "Add payment milestones from a project's page to track invoices here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Milestone</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => {
                const s = MILESTONE_STATUSES.find((x) => x.value === m.status);
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${m.project.id}`} className="hover:underline">
                        {m.project.name}
                      </Link>
                      {m.project.company?.name && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {m.project.company.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {m.label}
                      {m.invoice_no && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          #{m.invoice_no}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatINR(Number(m.amount))}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={s?.badge}>
                        {s?.label ?? m.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{dateStr(m.due_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{dateStr(m.paid_on)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
