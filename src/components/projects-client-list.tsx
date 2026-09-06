"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
} from "@/lib/types";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const label = (list: { value: string; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

type ProjectRow = {
  id: string;
  name: string;
  type: string;
  phase: string;
  status: string;
  company_id: string | null;
  company: { name: string } | null;
  _count: { tasks: number };
};

export function ProjectsClientList({
  projects,
  companies,
}: {
  projects: ProjectRow[];
  companies: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [phase, setPhase] = useState("");
  const [companyId, setCompanyId] = useState("");

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (status && p.status !== status) return false;
        if (type && p.type !== type) return false;
        if (phase && p.phase !== phase) return false;
        if (companyId && p.company_id !== companyId) return false;
        return true;
      }),
    [projects, status, type, phase, companyId],
  );

  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of filtered) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return PROJECT_STATUSES.map((s) => ({
      label: s.label,
      value: counts.get(s.value) ?? 0,
    })).filter((d) => d.value > 0);
  }, [filtered]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (phase) params.set("phase", phase);
    if (companyId) params.set("company", companyId);
    return `/api/reports/projects?${params.toString()}`;
  }, [status, type, phase, companyId]);

  const hasFilters = !!(status || type || phase || companyId);

  return (
    <>
      {chartData.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projects by status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>
      )}

      <ListFilterBar
        filters={[
          { key: "status", label: "Status", options: PROJECT_STATUSES },
          { key: "type", label: "Type", options: PROJECT_TYPES },
          { key: "phase", label: "Phase", options: PROJECT_PHASES },
          {
            key: "company",
            label: "Company",
            options: companies.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
        values={{ status, type, phase, company: companyId }}
        onFilterChange={(key, value) => {
          if (key === "status") setStatus(value);
          else if (key === "type") setType(value);
          else if (key === "phase") setPhase(value);
          else if (key === "company") setCompanyId(value);
        }}
        onClear={() => {
          setStatus("");
          setType("");
          setPhase("");
          setCompanyId("");
        }}
        exportHref={exportHref}
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            {hasFilters ? "No projects match these filters" : "No projects yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try clearing a filter."
              : "Create your first project to start tracking delivery and tasks."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {p.company?.name ?? "Internal"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {label(PROJECT_TYPES, p.type)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{label(PROJECT_PHASES, p.phase)}</Badge>
                    <Badge
                      variant={p.status === "active" ? "default" : "outline"}
                    >
                      {label(PROJECT_STATUSES, p.status)}
                    </Badge>
                    <Badge variant="secondary">
                      {p._count.tasks} task{p._count.tasks === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
