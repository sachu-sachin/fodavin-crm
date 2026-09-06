"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  SOCIAL_PLATFORMS,
  POST_CATEGORY_MAP,
  type SocialPost,
} from "@/lib/types";
import { clearPosts } from "@/lib/actions/social";
import { formatTimeIST, istDateKey, monthYearLabel } from "@/lib/format";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { PlatformIcon } from "@/components/social-icons";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const platformLabel = (v: string) =>
  SOCIAL_PLATFORMS.find((p) => p.value === v)?.label ?? v;

const pad = (n: number) => String(n).padStart(2, "0");
// Calendar-cell key (visual date) — matches istDateKey's "YYYY-MM-DD" form.
const cellKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

export function SocialCalendar({
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
  const [cursor, setCursor] = useState({
    year: initialYear,
    month: initialMonth,
  });
  const [, startTransition] = useTransition();
  const { year, month } = cursor;

  function onClearDay(ids: string[]) {
    if (!ids.length) return;
    if (
      !window.confirm(
        `Remove all ${ids.length} planned post${
          ids.length === 1 ? "" : "s"
        } on this day?`,
      )
    )
      return;
    startTransition(async () => {
      await clearPosts(ids);
      toast.success("Day cleared");
    });
  }

  const byDay: Record<string, SocialPost[]> = {};
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const k = istDateKey(p.scheduled_at);
    (byDay[k] ??= []).push(p);
  }

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = monthYearLabel(year, month);

  const shift = (delta: number) =>
    setCursor((c) => {
      const m = c.month + delta;
      const year = c.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>
            ‹
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor({ year: initialYear, month: initialMonth })}
          >
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => shift(1)}>
            ›
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 gap-px border-b text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {cells.map((day, i) => {
              if (day === null) {
                return <div key={i} className="min-h-28 bg-muted/20" />;
              }
              const key = cellKey(year, month, day);
              const dayPosts = (byDay[key] ?? []).sort((a, b) =>
                (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
              );
              const isToday = key === todayKey;
              return (
                <div
                  key={i}
                  className="group min-h-28 bg-card p-1.5 align-top"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={
                        isToday
                          ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                          : "px-1 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {day}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {dayPosts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onClearDay(dayPosts.map((p) => p.id))}
                          title="Clear all posts on this day"
                          className="rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                        >
                          🗑
                        </button>
                      )}
                      <SocialPostDialog
                        companies={companies}
                        assignees={assignees}
                        defaultDate={key}
                        trigger={
                          <button
                            type="button"
                            className="rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                            title="Add post"
                          >
                            +
                          </button>
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayPosts.map((p) => {
                      const cat = p.category
                        ? POST_CATEGORY_MAP[p.category]
                        : null;
                      return (
                        <SocialPostDialog
                          key={p.id}
                          post={p}
                          companies={companies}
                          assignees={assignees}
                          trigger={
                            <button
                              type="button"
                              className="flex w-full items-center gap-1 rounded border bg-background px-1.5 py-1 text-left text-[11px] hover:border-primary/50"
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  cat?.dot ?? "bg-muted-foreground"
                                }`}
                              />
                              <span
                                className="shrink-0 text-muted-foreground"
                                title={platformLabel(p.platform)}
                              >
                                <PlatformIcon platform={p.platform} className="h-2.5 w-2.5" />
                              </span>
                              <span className="truncate">{p.title}</span>
                              {p.scheduled_at && (
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                  {formatTimeIST(p.scheduled_at)}
                                </span>
                              )}
                            </button>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
