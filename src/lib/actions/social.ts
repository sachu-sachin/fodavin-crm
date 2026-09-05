"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { istDateKey, istInstant, parseISTInput } from "@/lib/format";
import type { SocialPlatform, PostStatus, PostCategory } from "@/lib/types";

export type SocialState = { error?: string; success?: string };

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

const PLATFORMS = new Set<SocialPlatform>([
  "instagram",
  "facebook",
  "linkedin",
  "twitter",
  "tiktok",
  "youtube",
  "other",
]);
const STATUSES = new Set<PostStatus>([
  "idea",
  "draft",
  "needs_approval",
  "scheduled",
  "published",
  "cancelled",
]);
const CATEGORIES = new Set<PostCategory>([
  "brand_awareness",
  "services",
  "educational",
  "interactive",
  "fun",
  "promotion",
  "testimonial",
]);

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function parseDateTime(v: FormDataEntryValue | null): Date | null {
  // datetime-local values are treated as IST wall time.
  return parseISTInput(String(v ?? ""));
}

function postDataFromForm(formData: FormData) {
  const platform = String(formData.get("platform") ?? "instagram") as SocialPlatform;
  const status = String(formData.get("status") ?? "idea") as PostStatus;
  const category = String(formData.get("category") ?? "") as PostCategory;
  return {
    title: String(formData.get("title") ?? "").trim(),
    content: str(formData.get("content")),
    platform: PLATFORMS.has(platform) ? platform : "instagram",
    category: CATEGORIES.has(category) ? category : null,
    status: STATUSES.has(status) ? status : "idea",
    company_id: str(formData.get("company_id")),
    assignee_id: str(formData.get("assignee_id")),
    scheduled_at: parseDateTime(formData.get("scheduled_at")),
    reminder_at: parseDateTime(formData.get("reminder_at")),
    link_url: str(formData.get("link_url")),
    notes: str(formData.get("notes")),
  };
}

export async function createPost(
  _prev: SocialState,
  formData: FormData,
): Promise<SocialState> {
  const userId = await requireUserId("social.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const data = postDataFromForm(formData);
  if (!data.title) return { error: "Give the post a title." };

  await prisma.socialPost.create({ data: { ...data, created_by: userId } });
  revalidatePath("/social");
  return { success: `"${data.title}" added.` };
}

export async function updatePost(
  _prev: SocialState,
  formData: FormData,
): Promise<SocialState> {
  if (!(await requireUserId("social.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const data = postDataFromForm(formData);
  if (!data.title) return { error: "Give the post a title." };

  await prisma.socialPost.update({ where: { id }, data });
  revalidatePath("/social");
  return { success: "Post updated." };
}

export async function deletePost(formData: FormData): Promise<void> {
  if (!(await requireUserId("social.manage"))) return;
  const id = String(formData.get("id") ?? "");
  await prisma.socialPost.delete({ where: { id } });
  revalidatePath("/social");
}

/** Move a post to a different workflow column (Kanban DnD). */
export async function movePostStatus(
  id: string,
  status: PostStatus,
): Promise<void> {
  if (!(await requireUserId("social.manage"))) return;
  if (!STATUSES.has(status)) return;
  await prisma.socialPost.update({ where: { id }, data: { status } });
  revalidatePath("/social");
}

/** Dismiss a post's reminder (clears reminder_at). */
export async function dismissReminder(formData: FormData): Promise<void> {
  if (!(await requireUserId("social.manage"))) return;
  const id = String(formData.get("id") ?? "");
  await prisma.socialPost.update({ where: { id }, data: { reminder_at: null } });
  revalidatePath("/social");
}

/** Delete a specific set of posts — used by the calendar's "clear day" reset. */
export async function clearPosts(ids: string[]): Promise<void> {
  if (!(await requireUserId("social.manage"))) return;
  if (!ids.length) return;
  await prisma.socialPost.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/social");
}

// -- Weekly content plan ------------------------------------------------------

// Every platform is active every day. Each weekday has a theme + category,
// giving a balanced rotation of brand, services, education, interaction & fun.
const PLAN_PLATFORMS: SocialPlatform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
];

// [hour, minute] local posting time per platform.
const PLATFORM_TIME: Record<string, [number, number]> = {
  linkedin: [9, 0],
  instagram: [11, 0],
  facebook: [13, 0],
  youtube: [17, 0],
};

const PLATFORM_FORMAT: Record<string, string> = {
  linkedin: "Post / Article",
  instagram: "Reel / Carousel",
  facebook: "Post",
  youtube: "Video",
};

// day of week (0 = Sun … 6 = Sat) -> theme
const WEEKLY_THEMES: Record<
  number,
  { name: string; category: PostCategory; caption: string }
> = {
  1: {
    name: "Monday Motivation",
    category: "brand_awareness",
    caption:
      "Kick off the week — who we are and how Fodavin turns ideas into websites & apps.",
  },
  2: {
    name: "Tech Tip Tuesday",
    category: "educational",
    caption:
      "A quick, useful web/app development tip your audience can save and use.",
  },
  3: {
    name: "Work Showcase Wednesday",
    category: "services",
    caption:
      "Feature a recent build — the problem, the solution, and the stack behind it.",
  },
  4: {
    name: "Interactive Thursday",
    category: "interactive",
    caption:
      "Ask a question or run a poll (e.g. which design/tech do you prefer?).",
  },
  5: {
    name: "Behind the Scenes Friday",
    category: "fun",
    caption: "A fun, human moment from the Fodavin team this week.",
  },
  6: {
    name: "Client Success Saturday",
    category: "testimonial",
    caption: "Share a client testimonial, result, or mini case study.",
  },
  0: {
    name: "Sunday Spotlight",
    category: "brand_awareness",
    caption: "Weekly recap + a dose of inspiration to close the week.",
  },
};

/**
 * Generate a 7-day content plan (all times in IST): for each of the next 7
 * days, one post per platform (LinkedIn / Instagram / Facebook / YouTube)
 * using that weekday's theme + category. Skips any platform+day slot that
 * already has a post, so it's safe to re-run (fills gaps, no duplicates).
 */
export async function generateWeeklyPlan(formData: FormData): Promise<void> {
  const userId = await requireUserId("social.manage");
  if (!userId) return;
  const startStr = String(formData.get("start") ?? "");
  const startKey = startStr || istDateKey(new Date()); // IST "today"
  const [y, mo, d] = startKey.split("-").map(Number);

  // Window covering the 7 IST days, for the "already planned" check.
  const windowStart = istInstant(startKey, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowStart.getUTCDate() + 7);

  const existing = await prisma.socialPost.findMany({
    where: { scheduled_at: { gte: windowStart, lt: windowEnd } },
    select: { platform: true, scheduled_at: true },
  });
  const taken = new Set(
    existing
      .filter((e) => e.scheduled_at)
      .map((e) => `${e.platform}_${istDateKey(e.scheduled_at!)}`),
  );

  const data: Prisma.SocialPostCreateManyInput[] = [];
  for (let i = 0; i < 7; i++) {
    // 06:30 UTC ≈ 12:00 IST, so getUTCDay() gives this IST date's weekday.
    const noon = new Date(Date.UTC(y, mo - 1, d + i, 6, 30));
    const dayKey = istDateKey(noon);
    const theme = WEEKLY_THEMES[noon.getUTCDay()];
    for (const platform of PLAN_PLATFORMS) {
      if (taken.has(`${platform}_${dayKey}`)) continue;
      const [h, m] = PLATFORM_TIME[platform];
      const scheduled = istInstant(dayKey, h, m);
      data.push({
        title: theme.name,
        content: `${PLATFORM_FORMAT[platform]} — ${theme.caption}`,
        platform,
        category: theme.category,
        status: "idea",
        scheduled_at: scheduled,
        reminder_at: new Date(scheduled.getTime() - 60 * 60 * 1000),
        created_by: userId,
      });
    }
  }

  if (data.length) await prisma.socialPost.createMany({ data });
  revalidatePath("/social");
}
