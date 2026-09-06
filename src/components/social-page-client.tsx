"use client";

import { useMemo, useState } from "react";
import {
  SOCIAL_PLATFORMS,
  POST_CATEGORIES,
  POST_STATUSES,
  type SocialPost,
} from "@/lib/types";
import { dismissReminder } from "@/lib/actions/social";
import { formatDateTimeIST } from "@/lib/format";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { SocialCalendar } from "@/components/social-calendar";
import { SocialBoard } from "@/components/social-board";
import { PlatformIcon } from "@/components/social-icons";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const platformLabel = (v: string) =>
  SOCIAL_PLATFORMS.find((p) => p.value === v)?.label ?? v;

export function SocialPageClient({
  posts,
  companies,
  assignees,
  initialYear,
  initialMonth,
  todayKey,
}: {
  posts: SocialPost[];
  companies: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  initialYear: number;
  initialMonth: number;
  todayKey: string;
}) {
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");

  const filtered = useMemo(
    () =>
      posts.filter((p) => {
        if (platform && p.platform !== platform) return false;
        if (category && p.category !== category) return false;
        if (status && p.status !== status) return false;
        if (assignee && p.assignee_id !== assignee) return false;
        return true;
      }),
    [posts, platform, category, status, assignee],
  );

  // Recomputed each render is intentional — reminders/charts should reflect
  // "now" as the user is actually viewing the page.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const remindersDue = useMemo(
    () =>
      filtered
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
        ),
    [filtered, now],
  );

  const unscheduled = useMemo(
    () => filtered.filter((p) => !p.scheduled_at),
    [filtered],
  );

  const byPlatform = useMemo(
    () =>
      SOCIAL_PLATFORMS.map((p) => ({
        label: p.label,
        value: filtered.filter((post) => post.platform === p.value).length,
      })).filter((d) => d.value > 0),
    [filtered],
  );

  const byStatus = useMemo(
    () =>
      POST_STATUSES.map((s) => ({
        label: s.label,
        value: filtered.filter((post) => post.status === s.value).length,
      })).filter((d) => d.value > 0),
    [filtered],
  );

  const byMonth = useMemo(() => {
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
    for (const p of filtered) {
      const at = p.scheduled_at ?? p.created_at;
      const key = at.slice(0, 7);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return months.map((m) => ({ label: m.label, value: counts.get(m.key) ?? 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (assignee) params.set("assignee", assignee);
    return `/api/reports/social?${params.toString()}`;
  }, [platform, category, status, assignee]);

  const hasFilters = !!(platform || category || status || assignee);

  return (
    <>
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
        values={{ platform, category, status, assignee }}
        onFilterChange={(key, value) => {
          if (key === "platform") setPlatform(value);
          else if (key === "category") setCategory(value);
          else if (key === "status") setStatus(value);
          else if (key === "assignee") setAssignee(value);
        }}
        onClear={() => {
          setPlatform("");
          setCategory("");
          setStatus("");
          setAssignee("");
        }}
        exportHref={exportHref}
      />

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="pt-4">
          <SocialCalendar
            posts={filtered}
            companies={companies}
            assignees={assignees}
            initialYear={initialYear}
            initialMonth={initialMonth}
            todayKey={todayKey}
          />
        </TabsContent>

        <TabsContent value="board" className="pt-4">
          {filtered.length === 0 ? (
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
              posts={filtered}
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
    </>
  );
}
