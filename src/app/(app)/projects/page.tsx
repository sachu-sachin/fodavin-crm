import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ProjectsClientList } from "@/components/projects-client-list";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requirePermission("projects.view");

  const [projects, companies] = await Promise.all([
    // Explicit select (not include on top of a bare findMany): the default
    // findMany would also carry `budget`, a Prisma Decimal — passing that to
    // this "use client" list component would hit the same
    // "Only plain objects can be passed to Client Components... Decimal
    // objects are not supported" issue documented in docs/testing.md's
    // Findings. Selecting only what's rendered avoids it entirely.
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        phase: true,
        status: true,
        company_id: true,
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

      <ProjectsClientList projects={projects} companies={companies} />
    </div>
  );
}
