import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  type ProjectType,
  type ProjectPhase,
  type ProjectStatus,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const label = (
  list: { value: string; label: string }[],
  v: string,
) => list.find((o) => o.value === v)?.label ?? v;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("projects.view");

  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const type = typeof params.type === "string" ? params.type : undefined;
  const phase = typeof params.phase === "string" ? params.phase : undefined;
  const companyId = typeof params.company === "string" ? params.company : undefined;

  const where: Prisma.ProjectWhereInput = {
    ...(status ? { status: status as ProjectStatus } : {}),
    ...(type ? { type: type as ProjectType } : {}),
    ...(phase ? { phase: phase as ProjectPhase } : {}),
    ...(companyId ? { company_id: companyId } : {}),
  };

  const [projects, companies, allForChart] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        company: { select: { name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({ select: { status: true } }),
  ]);

  const statusCounts = new Map<string, number>();
  for (const p of allForChart) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
  }
  const chartData = PROJECT_STATUSES.map((s) => ({
    label: s.label,
    value: statusCounts.get(s.value) ?? 0,
  })).filter((d) => d.value > 0);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (type) exportParams.set("type", type);
  if (phase) exportParams.set("phase", phase);
  if (companyId) exportParams.set("company", companyId);

  const hasFilters = !!(status || type || phase || companyId);

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Client work and internal initiatives, tracked through delivery."
      >
        <ProjectFormDialog
          companies={companies}
          trigger={<Button>New project</Button>}
        />
      </PageHeader>

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
        exportHref={`/api/reports/projects?${exportParams.toString()}`}
      />

      {projects.length === 0 ? (
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
          {projects.map((p) => (
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
    </div>
  );
}
