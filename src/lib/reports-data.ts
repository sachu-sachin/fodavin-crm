import "server-only";
import { prisma } from "@/lib/prisma";
import { can, type SessionProfile } from "@/lib/auth";

/**
 * Can this session review (read and comment on) `profileId`'s daily reports?
 * Everyone's with reports.view_all; a lead's direct reports with
 * reports.view_team. Kept out of the "use server" file so it can't be called
 * from the browser as an action.
 */
export async function canReviewReportsOf(
  session: SessionProfile,
  profileId: string,
): Promise<boolean> {
  if (can(session, "reports.view_all")) return true;
  if (!can(session, "reports.view_team") || profileId === session.userId) return false;
  const person = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { reports_to_id: true },
  });
  return person?.reports_to_id === session.userId;
}

/** The people whose reports this session reviews (besides their own). */
export async function reviewablePeople(
  session: SessionProfile,
): Promise<{ id: string; name: string }[]> {
  const all = can(session, "reports.view_all");
  if (!all && !can(session, "reports.view_team")) return [];
  const people = await prisma.profile.findMany({
    where: { is_active: true, ...(all ? {} : { reports_to_id: session.userId }) },
    select: { id: true, full_name: true, email: true },
    orderBy: { full_name: "asc" },
  });
  return people.map((p) => ({ id: p.id, name: p.full_name || p.email?.split("@")[0] || "User" }));
}
