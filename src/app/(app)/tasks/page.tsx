import { prisma } from "@/lib/prisma";
import { toTaskDTO } from "@/lib/task-dto";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { TaskBoard, type BoardTask } from "@/components/task-board";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";


export default async function TasksPage() {
  await requirePermission("tasks.view");
  const [rawTasks, profiles, projects] = await Promise.all([
    prisma.task.findMany({
      include: {
        project: { select: { name: true } },
        meeting: { select: { title: true } },
        onboarding: {
          select: { profile: { select: { full_name: true, email: true } } },
        },
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

  const tasks: BoardTask[] = rawTasks.map(({ project, meeting, onboarding, ...t }) => ({
    ...toTaskDTO(t),
    project_name: project?.name ?? null,
    meeting_title: meeting?.title ?? null,
    onboarding_for: onboarding
      ? onboarding.profile.full_name || onboarding.profile.email?.split("@")[0] || "User"
      : null,
  }));

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Everyone's work: project tasks and individual tasks."
      >
        <TaskFormDialog
          projects={projects}
          assignees={assignees}
          trigger={<Button>New task</Button>}
        />
      </PageHeader>

      {tasks.length === 0 ? (
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
