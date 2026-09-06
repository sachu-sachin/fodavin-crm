import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { type SocialPost } from "@/lib/types";
import { istDateKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SocialPostDialog } from "@/components/social-post-dialog";
import { SocialPageClient } from "@/components/social-page-client";
import { GeneratePlanButton } from "@/components/generate-plan-button";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const toISO = (d: Date | null) => (d ? d.toISOString() : null);

export default async function SocialPage() {
  await requirePermission("social.view");

  const [rawPosts, companies, profiles] = await Promise.all([
    prisma.socialPost.findMany({ orderBy: { created_at: "desc" } }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const assignees = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email?.split("@")[0] || "User",
  }));

  const posts: SocialPost[] = rawPosts.map((p) => ({
    ...p,
    scheduled_at: toISO(p.scheduled_at),
    reminder_at: toISO(p.reminder_at),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }));

  // Server component: current time per request is intentional.
  // eslint-disable-next-line react-hooks/purity
  const todayKey = istDateKey(new Date(Date.now())); // IST "today"
  const [istYear, istMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <PageHeader
        title="Social"
        description="Plan, schedule and assign social media posts across all platforms."
      >
        <GeneratePlanButton />
        <SocialPostDialog
          companies={companies}
          assignees={assignees}
          trigger={<Button>New post</Button>}
        />
      </PageHeader>

      <SocialPageClient
        posts={posts}
        companies={companies}
        assignees={assignees}
        initialYear={istYear}
        initialMonth={istMonth - 1}
        todayKey={todayKey}
      />
    </div>
  );
}
