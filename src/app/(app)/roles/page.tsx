import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { RoleManager } from "@/components/role-manager";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("roles.manage");

  const [roles, counts] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.profile.groupBy({ by: ["role_id"], _count: true }),
  ]);

  // How many people hold each role — shown so you can see the blast radius
  // before changing or deleting one.
  const usageByRole = Object.fromEntries(
    counts
      .filter((c) => c.role_id)
      .map((c) => [c.role_id as string, c._count]),
  );

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Define what each role can see and do. Changes apply the next time the person loads a page."
      />
      <RoleManager
        roles={roles as unknown as Role[]}
        usageByRole={usageByRole}
      />
    </div>
  );
}
