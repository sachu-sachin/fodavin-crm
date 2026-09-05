import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const label = (
  list: { value: string; label: string }[],
  v: string,
) => list.find((o) => o.value === v)?.label ?? v;

export default async function ProjectsPage() {
  await requirePermission("projects.view");
  const [projects, companies] = await Promise.all([
    prisma.project.findMany({
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
  ]);

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

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to start tracking delivery and tasks.
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
