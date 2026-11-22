import type { Prisma } from "@prisma/client";

export type AnnouncementStatus = "scheduled" | "live" | "expired";

/** Where an announcement is in its life, at `now`. */
export function announcementStatus(
  a: { publish_at: string | Date; expires_at: string | Date | null },
  now: Date,
): AnnouncementStatus {
  if (new Date(a.publish_at).getTime() > now.getTime()) return "scheduled";
  if (a.expires_at && new Date(a.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return "live";
}

/**
 * Is it addressed to someone holding these roles (main + additional)? An
 * empty audience means everyone.
 */
export function isForRole(
  a: { audience_role_ids: string[] },
  roleIds: readonly string[],
): boolean {
  return (
    a.audience_role_ids.length === 0 ||
    roleIds.some((id) => a.audience_role_ids.includes(id))
  );
}

/**
 * The prisma `where` for what a person sees: live now, and addressed to
 * everyone or to one of their roles. Mirrors announcementStatus + isForRole.
 */
export function liveForRoleWhere(
  roleIds: readonly string[],
  now: Date,
): Prisma.AnnouncementWhereInput {
  return {
    publish_at: { lte: now },
    AND: [
      { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      {
        OR: [
          { audience_role_ids: { isEmpty: true } },
          ...(roleIds.length > 0
            ? [{ audience_role_ids: { hasSome: [...roleIds] } }]
            : []),
        ],
      },
    ],
  };
}

/** Pinned first, then newest first. */
export function sortForFeed<T extends { pinned: boolean; publish_at: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.publish_at.localeCompare(a.publish_at),
  );
}
