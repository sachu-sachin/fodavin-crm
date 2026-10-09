"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authorize, getSessionProfile, DENIED_MESSAGE } from "@/lib/auth";
import { parseISTInput } from "@/lib/format";
import { announcementStatus, isForRole } from "@/lib/announcements";
import type { AnnouncementCategory } from "@/lib/types";

export type AnnouncementState = { error?: string; success?: string };

const CATEGORIES = new Set<AnnouncementCategory>([
  "general",
  "policy",
  "holiday",
  "event",
  "urgent",
]);

function revalidateAnnouncements() {
  revalidatePath("/announcements");
  revalidatePath("/");
}

async function announcementDataFromForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return { error: "Give the announcement a title." };
  if (!body) return { error: "Write the announcement." };

  // datetime-local values are treated as IST wall time. A blank publish time
  // means "now".
  const publishInput = String(formData.get("publish_at") ?? "");
  const publish_at = publishInput.trim() ? parseISTInput(publishInput) : new Date();
  if (!publish_at) return { error: "That publish time isn't valid." };
  const expiresInput = String(formData.get("expires_at") ?? "");
  const expires_at = expiresInput.trim() ? parseISTInput(expiresInput) : null;
  if (expiresInput.trim() && !expires_at) {
    return { error: "That expiry time isn't valid." };
  }
  if (expires_at && expires_at.getTime() <= publish_at.getTime()) {
    return { error: "The expiry must be after the publish time." };
  }

  // Only real roles; an unknown id would silently hide it from everyone.
  const requested = [
    ...new Set(
      formData
        .getAll("audience_role_ids")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  const known = requested.length
    ? new Set(
        (
          await prisma.role.findMany({
            where: { id: { in: requested } },
            select: { id: true },
          })
        ).map((r) => r.id),
      )
    : new Set<string>();

  const category = String(formData.get("category") ?? "general") as AnnouncementCategory;
  return {
    data: {
      title,
      body,
      category: CATEGORIES.has(category) ? category : "general",
      pinned: formData.get("pinned") === "on",
      requires_ack: formData.get("requires_ack") === "on",
      audience_role_ids: requested.filter((id) => known.has(id)),
      publish_at,
      expires_at,
    },
  };
}

export async function createAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const session = await authorize("announcements.manage");
  if (!session) return { error: DENIED_MESSAGE };
  const parsed = await announcementDataFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  await prisma.announcement.create({
    data: { ...parsed.data, created_by: session.userId },
  });
  revalidateAnnouncements();
  return {
    success:
      parsed.data.publish_at.getTime() > Date.now()
        ? `"${parsed.data.title}" scheduled.`
        : `"${parsed.data.title}" posted.`,
  };
}

export async function updateAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  if (!(await authorize("announcements.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const parsed = await announcementDataFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  // After a material change (e.g. a policy rewrite), everyone should read it
  // again — so the editor can clear the existing reads in the same step.
  const resetReads = formData.get("reset_reads") === "on";
  await prisma.announcement.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(resetReads ? { reads: { deleteMany: {} } } : {}),
    },
  });
  revalidateAnnouncements();
  return {
    success: resetReads
      ? "Announcement updated — everyone will be asked to read it again."
      : "Announcement updated.",
  };
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  if (!(await authorize("announcements.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.announcement.delete({ where: { id } });
  revalidateAnnouncements();
}

/**
 * Mark an announcement read (or, for requires_ack, acknowledged) by the
 * signed-in employee. Anyone can — but only for one that's live and
 * addressed to them, so this can't be used to probe hidden ones.
 */
export async function markAnnouncementRead(id: string): Promise<void> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!id) return;

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { publish_at: true, expires_at: true, audience_role_ids: true },
  });
  if (!announcement) return;
  if (announcementStatus(announcement, new Date()) !== "live") return;
  if (!isForRole(announcement, session.profile?.role_id ?? null)) return;

  await prisma.announcementRead.upsert({
    where: {
      announcement_id_profile_id: {
        announcement_id: id,
        profile_id: session.userId,
      },
    },
    create: { announcement_id: id, profile_id: session.userId },
    update: {},
  });
  revalidateAnnouncements();
}
