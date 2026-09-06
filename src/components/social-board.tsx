"use client";

import { useState, useTransition } from "react";
import { movePostStatus } from "@/lib/actions/social";
import {
  POST_STATUSES,
  SOCIAL_PLATFORMS,
  POST_CATEGORY_MAP,
  type SocialPost,
  type PostStatus,
} from "@/lib/types";
import { formatDateTimeIST } from "@/lib/format";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { PlatformIcon } from "@/components/social-icons";
import { Badge } from "@/components/ui/badge";

const PLATFORM_LABEL = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.value, p.label]),
) as Record<string, string>;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SocialBoard({
  posts,
  companies,
  assignees,
}: {
  posts: SocialPost[];
  companies: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(posts);
  const [prev, setPrev] = useState(posts);
  const [dragOver, setDragOver] = useState<PostStatus | null>(null);
  const [, startTransition] = useTransition();

  if (prev !== posts) {
    setPrev(posts);
    setItems(posts);
  }

  const nameOf = (id: string | null) =>
    id ? assignees.find((a) => a.id === id)?.name : null;

  function handleDrop(status: PostStatus, id: string) {
    setDragOver(null);
    const item = items.find((i) => i.id === id);
    if (!item || item.status === status) return;
    setItems((p) => p.map((i) => (i.id === id ? { ...i, status } : i)));
    startTransition(() => movePostStatus(id, status));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {POST_STATUSES.map((col) => {
        const colItems = items.filter((i) => i.status === col.value);
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.value);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.value, e.dataTransfer.getData("text/plain"));
            }}
            className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${
              dragOver === col.value ? "border-primary ring-1 ring-primary" : ""
            }`}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{col.label}</span>
              <span className="text-xs text-muted-foreground">
                {colItems.length}
              </span>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {colItems.map((post) => {
                const assignee = nameOf(post.assignee_id);
                const when = post.scheduled_at
                  ? formatDateTimeIST(post.scheduled_at)
                  : null;
                return (
                  <SocialPostDialog
                    key={post.id}
                    post={post}
                    companies={companies}
                    assignees={assignees}
                    nativeTrigger={false}
                    trigger={
                      <div
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", post.id)
                        }
                        className="cursor-grab rounded-md border bg-card p-3 shadow-sm hover:border-primary/50 active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {post.category && (
                              <span
                                title={POST_CATEGORY_MAP[post.category].label}
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  POST_CATEGORY_MAP[post.category].dot
                                }`}
                              />
                            )}
                            {post.title}
                          </p>
                          {post.reminder_at && (
                            <span title="Reminder set" className="text-muted-foreground">
                              🔔
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                            <PlatformIcon platform={post.platform} className="h-3 w-3" />
                            {PLATFORM_LABEL[post.platform]}
                          </Badge>
                          <div className="flex items-center gap-2">
                            {when && (
                              <span className="text-[11px] text-muted-foreground">
                                {when}
                              </span>
                            )}
                            {assignee && (
                              <span
                                title={assignee}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary"
                              >
                                {initials(assignee)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
