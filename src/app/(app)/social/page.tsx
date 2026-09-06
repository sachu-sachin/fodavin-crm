import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  SOCIAL_PLATFORMS,
  POST_CATEGORIES,
  POST_STATUSES,
  type SocialPost,
  type SocialPlatform,
  type PostCategory,
  type PostStatus,
} from "@/lib/types";
import { dismissReminder } from "@/lib/actions/social";
import { formatDateTimeIST, istDateKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { SocialCalendar } from "@/components/social-calendar";
import { SocialBoard } from "@/components/social-board";
import { PlatformIcon } from "@/components/social-icons";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { GeneratePlanButton } from "@/components/generate-plan-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const platformLabel = (v: string) =>
  SOCIAL_PLATFORMS.find((p) => p.value === v)?.label ?? v;
const toISO = (d: Date | null) => (d ? d.toISOString() : null);

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("social.view");

  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const assignee = typeof params.assignee === "string" ? params.assignee : undefined;

  const where: Prisma.SocialPostWhereInput = {
    ...(platform ? { platform: platform as SocialPlatform } : {}),
    ...(category ? { category: category as PostCategory } : {}),
    ...(status ? { status: status as PostStatus } : {}),
    ...(assignee ? { assignee_id: assignee } : {}),
  };

  const [rawPosts, companies, profiles] = await Promise.all([
    prisma.socialPost.findMany({ where, orderBy: { created_at: "desc" } }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const assignees = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  const posts: SocialPost[] = rawPosts.map((p) => ({
    ...p,
    scheduled_at: toISO(p.scheduled_at),
    reminder_at: toISO(p.reminder_at),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }));

  // Server component: current time per request is intentional.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const todayKey = istDateKey(new Date(now)); // IST "today"
  const [istYear, istMonth] = todayKey.split("-").map(Number);

  const remindersDue = posts
    .filter(
      (p) =>
        p.reminder_at &&
        new Date(p.reminder_at).getTime() <= now &&
        p.status !== "published" &&
        p.status !== "cancelled",
    )
    .sort(
      (a, b) =>
        new Date(a.reminder_at!).getTime() - new Date(b.reminder_at!).getTime(),
    );

  const unscheduled = posts.filter((p) => !p.scheduled_at);

  const byPlatform = SOCIAL_PLATFORMS.map((p) => ({
    label: p.label,
    value: posts.filter((post) => post.platform === p.value).length,
  })).filter((d) => d.value > 0);

  const byStatus = POST_STATUSES.map((s) => ({
    label: s.label,
    value: posts.filter((post) => post.status === s.value).length,
  })).filter((d) => d.value > 0);

  const byMonth = (() => {
    const months: { key: string; label: string }[] = [];
    const anchor = new Date(now);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      });
    }
    const counts = new Map(months.map((m) => [m.key, 0]));
    for (const p of posts) {
      const at = p.scheduled_at ?? p.created_at;
      const key = at.slice(0, 7);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return months.map((m) => ({ label: m.label, value: counts.get(m.key) ?? 0 }));
  })();

  const exportParams = new URLSearchParams();
  if (platform) exportParams.set("platform", platform);
  if (category) exportParams.set("category", category);
  if (status) exportParams.set("status", status);
  if (assignee) exportParams.set("assignee", assignee);
  const hasFilters = !!(platform || category || status || assignee);

  return (
    <div>
      <PageHeader
        title="Social"
        description="Plan, schedule and assign social media posts across all platforms."
      >
        <GeneratePlanButton />
        <SocialPostDialog
          companies={companies}
          assignees={assignees}
          trigger={<Button>New post</Button>}
        />
      </PageHeader>

      {remindersDue.length > 0 && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              🔔 Reminders due ({remindersDue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {remindersDue.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                    <PlatformIcon platform={p.platform} className="h-3 w-3" />
                    {platformLabel(p.platform)}
                  </Badge>
                  <span className="font-medium">{p.title}</span>
                  {p.scheduled_at && (
                    <span className="text-muted-foreground">
                      · posts {formatDateTimeIST(p.scheduled_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <SocialPostDialog
                    post={p}
                    companies={companies}
                    assignees={assignees}
                    trigger={
                      <Button size="sm" variant="outline">
                        Open
                      </Button>
                    }
                  />
                  <form action={dismissReminder}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button size="sm" variant="ghost" type="submit">
                      Dismiss
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category legend */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {POST_CATEGORIES.map((c) => (
          <span key={c.value} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        ))}
      </div>

      <ListFilterBar
        filters={[
          { key: "platform", label: "Platform", options: SOCIAL_PLATFORMS },
          { key: "category", label: "Category", options: POST_CATEGORIES },
          { key: "status", label: "Status", options: POST_STATUSES },
          {
            key: "assignee",
            label: "Assignee",
            options: assignees.map((a) => ({ value: a.id, label: a.name })),
          },
        ]}
        exportHref={`/api/reports/social?${exportParams.toString()}`}
      />

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="pt-4">
          <SocialCalendar
            posts={posts}
            companies={companies}
            assignees={assignees}
            initialYear={istYear}
            initialMonth={istMonth - 1}
            todayKey={todayKey}
          />
        </TabsContent>

        <TabsContent value="board" className="pt-4">
          {posts.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-10 text-center">
              <p className="text-sm font-medium">
                {hasFilters ? "No posts match these filters" : "No posts yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? "Try clearing a filter."
                  : "Generate a 7-day plan or add a post to get started."}
              </p>
            </div>
          ) : (
            <SocialBoard
              posts={posts}
              companies={companies}
              assignees={assignees}
            />
          )}
        </TabsContent>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Posts by platform
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={byPlatform} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Posts by status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={byStatus} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Posts by month (last 6 months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={byMonth} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {unscheduled.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Unscheduled ideas ({unscheduled.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unscheduled.map((p) => (
              <SocialPostDialog
                key={p.id}
                post={p}
                companies={companies}
                assignees={assignees}
                trigger={
                  <button
                    type="button"
                    className="rounded-md border bg-background px-2.5 py-1 text-sm hover:border-primary/50"
                  >
                    <Badge variant="secondary" className="mr-1 flex items-center gap-1 text-[10px]">
                      <PlatformIcon platform={p.platform} className="h-3 w-3" />
                      {platformLabel(p.platform)}
                    </Badge>
                    {p.title}
                  </button>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
