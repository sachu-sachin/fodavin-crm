"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MILESTONE_STATUSES } from "@/lib/types";
import { formatDateKey, formatINR } from "@/lib/format";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dateStr = (d: Date | null) =>
  d ? formatDateKey(d.toISOString().slice(0, 10)) : null;

type MilestoneRow = {
  id: string;
  label: string;
  amount: number;
  status: string;
  invoice_no: string | null;
  due_date: Date | null;
  paid_on: Date | null;
  project_id: string;
  project: { id: string; name: string; company: { name: string } | null };
};

export function FinanceClientList({
  milestones,
  projects,
}: {
  milestones: MilestoneRow[];
  projects: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");

  const filtered = useMemo(
    () =>
      milestones.filter((m) => {
        if (status && m.status !== status) return false;
        if (projectId && m.project_id !== projectId) return false;
        return true;
      }),
    [milestones, status, projectId],
  );

  const chartData = useMemo(() => {
    const sums = new Map<string, number>();
    for (const m of filtered) sums.set(m.status, (sums.get(m.status) ?? 0) + m.amount);
    return MILESTONE_STATUSES.map((s) => ({
      label: s.label,
      value: sums.get(s.value) ?? 0,
    })).filter((d) => d.value > 0);
  }, [filtered]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (projectId) params.set("project", projectId);
    return `/api/reports/finance?${params.toString()}`;
  }, [status, projectId]);

  const hasFilters = !!(status || projectId);

  return (
    <>
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
        values={{ status, project: projectId }}
        onFilterChange={(key, value) => {
          if (key === "status") setStatus(value);
          else if (key === "project") setProjectId(value);
        }}
        onClear={() => {
          setStatus("");
          setProjectId("");
        }}
        exportHref={exportHref}
      />

      {filtered.length === 0 ? (
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
              {filtered.map((m) => {
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
                    <td className="px-3 py-2 font-medium">{formatINR(m.amount)}</td>
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
    </>
  );
}
