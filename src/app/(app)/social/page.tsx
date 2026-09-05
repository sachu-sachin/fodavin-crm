import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  SOCIAL_PLATFORMS,
  POST_CATEGORIES,
  type SocialPost,
} from "@/lib/types";
import { dismissReminder } from "@/lib/actions/social";
import { formatDateTimeIST, istDateKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { SocialCalendar } from "@/components/social-calendar";
import { SocialBoard } from "@/components/social-board";
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

export const dynamic = "force-dynamic";

const platformLabel = (v: string) =>
  SOCIAL_PLATFORMS.find((p) => p.value === v)?.label ?? v;
const toISO = (d: Date | null) => (d ? d.toISOString() : null);

export default async function SocialPage() {
  await requirePermission("social.view");
  const [rawPosts, companies, profiles] = await Promise.all([
    prisma.socialPost.findMany({ orderBy: { created_at: "desc" } }),
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
                  <Badge variant="secondary" className="text-[10px]">
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

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
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
              <p className="text-sm font-medium">No posts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a 7-day plan or add a post to get started.
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
                    <Badge variant="secondary" className="mr-1 text-[10px]">
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
