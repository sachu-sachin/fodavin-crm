import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import type { Announcement } from "@/lib/types";
import {
  announcementStatus,
  isForRole,
  liveForRoleWhere,
  sortForFeed,
} from "@/lib/announcements";
import { PageHeader } from "@/components/page-header";
import { AnnouncementFormDialog } from "@/components/announcement-form-dialog";
import { AnnouncementCard, type ReadReceipts } from "@/components/announcement-card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Everyone can read the announcements addressed to them — there's no view
// permission, deliberately: a notice people can be locked out of isn't one.
export default async function AnnouncementsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const canManage = can(session, "announcements.manage");
  const roleIds = session.roleIds;
  const now = new Date();

  const [rows, myReads, profiles, roles, allReads] = await Promise.all([
    prisma.announcement.findMany({
      // Managers see everything, including scheduled and expired ones.
      where: canManage ? {} : liveForRoleWhere(roleIds, now),
      orderBy: { publish_at: "desc" },
    }),
    prisma.announcementRead.findMany({
      where: { profile_id: session.userId },
      select: { announcement_id: true },
    }),
    prisma.profile.findMany({
      select: {
        id: true,
        full_name: true,
        email: true,
        role_id: true,
        is_active: true,
        extra_roles: { select: { role_id: true } },
      },
      orderBy: { created_at: "asc" },
    }),
    canManage
      ? prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    canManage
      ? prisma.announcementRead.findMany({
          select: { announcement_id: true, profile_id: true },
        })
      : [],
  ]);

  const nameOf = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email?.split("@")[0] || "User"]),
  );
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const readByMe = new Set(myReads.map((r) => r.announcement_id));
  const readersOf = new Map<string, Set<string>>();
  for (const r of allReads) {
    if (!readersOf.has(r.announcement_id)) readersOf.set(r.announcement_id, new Set());
    readersOf.get(r.announcement_id)!.add(r.profile_id);
  }
  const activeStaff = profiles
    .filter((p) => p.is_active)
    .map((p) => ({
      id: p.id,
      roleIds: [p.role_id, ...p.extra_roles.map((r) => r.role_id)].filter(
        (id): id is string => !!id,
      ),
    }));

  const announcements: Announcement[] = rows.map((a) => ({
    ...a,
    publish_at: a.publish_at.toISOString(),
    expires_at: a.expires_at?.toISOString() ?? null,
    created_at: a.created_at.toISOString(),
    updated_at: a.updated_at.toISOString(),
  }));

  function receiptsFor(a: Announcement): ReadReceipts {
    const audience = activeStaff.filter((p) => isForRole(a, p.roleIds));
    const readers = readersOf.get(a.id) ?? new Set<string>();
    return {
      read: audience.filter((p) => readers.has(p.id)).length,
      audience: audience.length,
      pending: audience.filter((p) => !readers.has(p.id)).map((p) => nameOf.get(p.id)!),
      audienceRoles: a.audience_role_ids.map((id) => roleName.get(id) ?? "a deleted role"),
    };
  }

  const withStatus = announcements.map((a) => ({ a, status: announcementStatus(a, now) }));
  const live = sortForFeed(withStatus.filter((x) => x.status === "live").map((x) => x.a));
  const scheduled = withStatus
    .filter((x) => x.status === "scheduled")
    .map((x) => x.a)
    .sort((x, y) => x.publish_at.localeCompare(y.publish_at));
  const expired = withStatus.filter((x) => x.status === "expired").map((x) => x.a);

  const card = (a: Announcement) => (
    <AnnouncementCard
      key={a.id}
      announcement={a}
      status={announcementStatus(a, now)}
      authorName={a.created_by ? (nameOf.get(a.created_by) ?? null) : null}
      // One not addressed to the viewer (a manager seeing everything) has
      // nothing for them to mark.
      isRead={readByMe.has(a.id) || !isForRole(a, roleIds)}
      receipts={canManage ? receiptsFor(a) : undefined}
      roles={canManage ? roles : undefined}
    />
  );

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Company news, holidays and policies."
      >
        {canManage && (
          <AnnouncementFormDialog
            roles={roles}
            trigger={<Button>New announcement</Button>}
          />
        )}
      </PageHeader>

      <div className="max-w-3xl space-y-8">
        <section className="space-y-3">
          {live.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-10 text-center">
              <p className="text-sm font-medium">No announcements right now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManage
                  ? "Post one to let the whole team know."
                  : "Anything the company posts for you will show up here."}
              </p>
            </div>
          ) : (
            live.map(card)
          )}
        </section>

        {canManage && scheduled.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Scheduled</h2>
            {scheduled.map(card)}
          </section>
        )}

        {canManage && expired.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Expired</h2>
            {expired.map(card)}
          </section>
        )}
      </div>
    </div>
  );
}
