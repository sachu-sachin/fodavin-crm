import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { offsetLabel } from "@/lib/onboarding";
import type { OnboardingTemplateData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { OnboardingTemplateDialog } from "@/components/onboarding-template-dialog";
import { StarterTemplateButton } from "@/components/starter-template-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OnboardingTemplatesPage() {
  await requirePermission("onboarding.manage");

  const [templates, profiles] = await Promise.all([
    prisma.onboardingTemplate.findMany({
      include: { items: { orderBy: { position: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.profile.findMany({
      select: { id: true, full_name: true, email: true, is_active: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const nameOf = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email?.split("@")[0] || "User"]),
  );
  const people = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, name: nameOf.get(p.id)! }));

  const data: OnboardingTemplateData[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    updated_at: t.updated_at.toISOString(),
    items: t.items.map((i) => ({
      title: i.title,
      description: i.description,
      assign_to_new_hire: i.assign_to_new_hire,
      assignee_id: i.assignee_id,
      due_offset_days: i.due_offset_days,
    })),
  }));

  const owner = (i: OnboardingTemplateData["items"][number]) =>
    i.assign_to_new_hire
      ? "New hire"
      : i.assignee_id
        ? (nameOf.get(i.assignee_id) ?? "Former employee")
        : "Unassigned";

  return (
    <div>
      <div className="mb-4">
        <Link href="/onboarding" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to onboarding
        </Link>
      </div>

      <PageHeader
        title="Checklist templates"
        description="Editing a template only affects onboardings started afterwards."
      >
        <StarterTemplateButton />
        <OnboardingTemplateDialog people={people} trigger={<Button>New template</Button>} />
      </PageHeader>

      {data.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No templates yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the starter template or create your own.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((t) => (
            <Card key={t.id} data-template={t.name}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  )}
                </div>
                <OnboardingTemplateDialog
                  // Fresh state whenever the saved template changes.
                  key={t.updated_at}
                  template={t}
                  people={people}
                  trigger={
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  }
                />
              </CardHeader>
              <CardContent>
                <ol className="space-y-1.5 text-sm">
                  {t.items.map((i, n) => (
                    <li key={n} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="mr-2 text-muted-foreground">{n + 1}.</span>
                        {i.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {owner(i)} · {offsetLabel(i.due_offset_days)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
