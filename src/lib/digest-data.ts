import "server-only";
import { prisma } from "@/lib/prisma";
import { allPermissions, expandPermissions } from "@/lib/permissions";
import { OPEN_INQUIRY_STAGES } from "@/lib/types";
import type { DigestPerson, DigestSource } from "@/lib/digest";

const IST = "+05:30";
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

function taskHref(t: {
  project_id: string | null;
  meeting_id: string | null;
  onboarding_id: string | null;
}) {
  if (t.project_id) return `/projects/${t.project_id}`;
  if (t.meeting_id) return `/meetings/${t.meeting_id}`;
  if (t.onboarding_id) return `/onboarding/${t.onboarding_id}`;
  return "/tasks";
}

/**
 * Everyone who could get a digest, and everything due for anyone on `today`
 * ("YYYY-MM-DD", IST), in one batch of queries rather than one per person.
 */
export async function loadDigestInputs(
  today: string,
  now: Date = new Date(),
): Promise<{ people: DigestPerson[]; source: DigestSource }> {
  // Date-only columns hold UTC midnight of the IST day (see dateStr in the
  // pages), so "due on or before today" compares against that.
  const todayDate = new Date(today);
  const startOfToday = new Date(`${today}T00:00:00${IST}`);
  const endOfToday = new Date(`${today}T23:59:59${IST}`);

  const [profiles, tasks, meetings, followUps, posts, policies] = await Promise.all([
    prisma.profile.findMany({
      where: { is_active: true },
      select: {
        id: true,
        full_name: true,
        email: true,
        role_id: true,
        email_digest: true,
        role: { select: { is_admin: true, permissions: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        status: { not: "done" },
        assignee_id: { not: null },
        due_date: { lte: todayDate },
      },
      select: {
        id: true,
        title: true,
        due_date: true,
        assignee_id: true,
        project_id: true,
        meeting_id: true,
        onboarding_id: true,
        project: { select: { name: true } },
        meeting: { select: { title: true } },
        onboarding: { select: { profile: { select: { full_name: true, email: true } } } },
      },
    }),
    prisma.meeting.findMany({
      where: { starts_at: { gte: startOfToday, lte: endOfToday } },
      select: {
        id: true,
        title: true,
        starts_at: true,
        location: true,
        company: { select: { name: true } },
        attendees: { select: { profile_id: true } },
      },
    }),
    prisma.inquiry.findMany({
      where: { stage: { in: OPEN_INQUIRY_STAGES }, next_follow_up: { lte: todayDate } },
      select: {
        id: true,
        title: true,
        next_follow_up: true,
        company: { select: { name: true } },
      },
    }),
    prisma.socialPost.findMany({
      where: {
        assignee_id: { not: null },
        status: { notIn: ["published", "cancelled"] },
        OR: [
          // Only reminders set for today: an old one on a post that was never
          // published would otherwise repeat in every email indefinitely.
          { reminder_at: { gte: startOfToday, lte: endOfToday } },
          { scheduled_at: { gte: startOfToday, lte: endOfToday } },
        ],
      },
      select: {
        id: true,
        title: true,
        platform: true,
        assignee_id: true,
        scheduled_at: true,
        reminder_at: true,
      },
    }),
    prisma.announcement.findMany({
      where: {
        requires_ack: true,
        publish_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        audience_role_ids: true,
        reads: { select: { profile_id: true } },
      },
    }),
  ]);

  const people: DigestPerson[] = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "there",
    email: p.email,
    roleId: p.role_id,
    permissions: p.role?.is_admin
      ? allPermissions()
      : expandPermissions(p.role?.permissions ?? []),
    emailDigest: p.email_digest,
  }));

  const source: DigestSource = {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      due: dateKey(t.due_date!),
      assigneeId: t.assignee_id!,
      href: taskHref(t),
      context:
        t.project?.name ??
        (t.meeting
          ? `from "${t.meeting.title}"`
          : t.onboarding
            ? `onboarding: ${t.onboarding.profile.full_name || t.onboarding.profile.email?.split("@")[0] || "a new joiner"}`
            : null),
    })),
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.starts_at.toISOString(),
      attendeeIds: m.attendees.map((a) => a.profile_id),
      context: m.company?.name ?? m.location,
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      title: f.title,
      due: dateKey(f.next_follow_up!),
      context: f.company?.name ?? null,
    })),
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      platform: p.platform,
      assigneeId: p.assignee_id!,
      scheduledAt:
        p.scheduled_at && p.scheduled_at >= startOfToday && p.scheduled_at <= endOfToday
          ? p.scheduled_at.toISOString()
          : null,
      reminderDue:
        p.reminder_at != null && p.reminder_at >= startOfToday && p.reminder_at <= endOfToday,
    })),
    policies: policies.map((a) => ({
      id: a.id,
      title: a.title,
      audienceRoleIds: a.audience_role_ids,
      readBy: new Set(a.reads.map((r) => r.profile_id)),
    })),
  };

  return { people, source };
}
