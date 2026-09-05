"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPost, updatePost, deletePost } from "@/lib/actions/social";
import {
  SOCIAL_PLATFORMS,
  POST_STATUSES,
  POST_CATEGORIES,
  type SocialPost,
  type PostStatus,
} from "@/lib/types";
import { toISTInputValue } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function SocialPostDialog({
  post,
  companies,
  assignees,
  defaultStatus = "idea",
  defaultDate,
  trigger,
  nativeTrigger = true,
}: {
  post?: SocialPost;
  companies: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  defaultStatus?: PostStatus;
  /** YYYY-MM-DD to prefill the schedule when adding from a calendar day. */
  defaultDate?: string;
  trigger: React.ReactElement;
  /** Set false when the trigger is not a native <button> (e.g. a draggable div). */
  nativeTrigger?: boolean;
}) {
  const isEdit = !!post;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updatePost : createPost)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        setOpen(false);
      }
    });
  }

  function onDelete() {
    if (!post) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", post.id);
      await deletePost(fd);
      toast.success("Post deleted");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={nativeTrigger} render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit post" : "New post"}</DialogTitle>
        </DialogHeader>
        <form
          action={onAction}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {isEdit && <input type="hidden" name="id" value={post.id} />}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Launch announcement"
              defaultValue={post?.title ?? ""}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <select
                id="platform"
                name="platform"
                className={selectClass}
                defaultValue={post?.platform ?? "instagram"}
              >
                {SOCIAL_PLATFORMS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className={selectClass}
                defaultValue={post?.status ?? defaultStatus}
              >
                {POST_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              className={selectClass}
              defaultValue={post?.category ?? ""}
            >
              <option value="">— None —</option>
              {POST_CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Caption / content</Label>
            <Textarea
              id="content"
              name="content"
              rows={4}
              defaultValue={post?.content ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="assignee_id">Assigned to</Label>
              <select
                id="assignee_id"
                name="assignee_id"
                className={selectClass}
                defaultValue={post?.assignee_id ?? ""}
              >
                <option value="">— Unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_id">Client (optional)</Label>
              <select
                id="company_id"
                name="company_id"
                className={selectClass}
                defaultValue={post?.company_id ?? ""}
              >
                <option value="">— Internal —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Scheduled for</Label>
              <Input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                defaultValue={
                  toISTInputValue(post?.scheduled_at ?? null) ||
                  (defaultDate ? `${defaultDate}T10:00` : "")
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder_at">Remind me at</Label>
              <Input
                id="reminder_at"
                name="reminder_at"
                type="datetime-local"
                defaultValue={toISTInputValue(post?.reminder_at ?? null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="link_url">Asset / link</Label>
            <Input
              id="link_url"
              name="link_url"
              placeholder="https://… (image, doc, draft)"
              defaultValue={post?.link_url ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={post?.notes ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={onDelete}
                disabled={pending}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
