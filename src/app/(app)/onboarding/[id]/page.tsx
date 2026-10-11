import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import type { Task } from "@/lib/types";
import { formatDateKey, istToday } from "@/lib/format";
import { deleteOnboarding } from "@/lib/actions/onboarding";
import { PageHeader } from "@/components/page-header";
import { TaskChecklist } from "@/components/task-checklist";
import { DeleteEntityButton } from "@/components/delete-entity-button";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const { id } = await params;

  const onboarding = await prisma.onboarding.findUnique({
    where: { id },
    include: {
      profile: { select: { full_name: true, email: true } },
      template: { select: { name: true } },
      tasks: { orderBy: [{ due_date: "asc" }, { position: "asc" }] },
    },
  });
  if (!onboarding) notFound();

  // Anyone with onboarding.view, the person being onboarded, and anyone with
  // a step on this checklist (their dashboard task links here).
  const isOwn = onboarding.profile_id === session.userId;
  const hasAStep = onboarding.tasks.some((t) => t.assignee_id === session.userId);
  if (!isOwn && !hasAStep && !can(session, "onboarding.view")) redirect("/");

  const profiles = await prisma.profile.findMany({
    where: { is_active: true },
    select: { id: true, full_name: true, email: true },
    orderBy: { created_at: "asc" },
  });
  const assignees = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  const name =
    onboarding.profile.full_name || onboarding.profile.email?.split("@")[0] || "User";
  const tasks: Task[] = onboarding.tasks.map((t) => ({
    ...t,
    due_date: dateStr(t.due_date),
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  }));
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div>
      {can(session, "onboarding.view") && (
        <div className="mb-4">
          <Link href="/onboarding" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to onboarding
          </Link>
        </div>
      )}

      <PageHeader
        title={isOwn ? "Your onboarding" : `Onboarding: ${name}`}
        description={`Starts ${formatDateKey(dateStr(onboarding.start_date)!)}${
          onboarding.template ? ` · ${onboarding.template.name}` : ""
        } · ${done} of ${tasks.length} done`}
      >
        {can(session, "onboarding.manage") && (
          <DeleteEntityButton
            action={deleteOnboarding}
            id={onboarding.id}
            entity="onboarding"
            name={`${name}'s onboarding`}
            impacts={[{ label: "checklist task", count: tasks.length }]}
          />
        )}
      </PageHeader>

      <div className="max-w-3xl">
        <TaskChecklist
          parent={{ onboardingId: onboarding.id }}
          heading="Checklist"
          addLabel="Add item"
          emptyHint="Add the steps for this person's first weeks."
          items={tasks}
          assignees={assignees}
          today={istToday()}
          canManage={can(session, "tasks.manage")}
          canAdd={can(session, "tasks.manage") && can(session, "onboarding.manage")}
          // A new joiner can tick off their own steps whatever their role.
          ownStepsOf={session.userId}
        />
      </div>
    </div>
  );
}
