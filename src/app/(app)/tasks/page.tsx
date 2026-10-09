import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { TaskBoard, type BoardTask } from "@/components/task-board";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function TasksPage() {
  await requirePermission("tasks.view");
  const [rawTasks, profiles, projects] = await Promise.all([
    prisma.task.findMany({
      include: {
        project: { select: { name: true } },
        meeting: { select: { title: true } },
      },
      orderBy: { created_at: "asc" },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const assignees = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  const tasks: BoardTask[] = rawTasks.map(({ project, meeting, ...t }) => ({
    ...t,
    project_name: project?.name ?? null,
    meeting_title: meeting?.title ?? null,
    due_date: dateStr(t.due_date),
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Every team member's work across all projects."
      >
        {projects.length > 0 && (
          <TaskFormDialog
            projects={projects}
            assignees={assignees}
            trigger={<Button>New task</Button>}
          />
        )}
      </PageHeader>

      {projects.length === 0 && tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project first, then add tasks to it.
          </p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No tasks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first task to start the board.
          </p>
        </div>
      ) : (
        <TaskBoard tasks={tasks} assignees={assignees} showProject />
      )}
    </div>
  );
}
