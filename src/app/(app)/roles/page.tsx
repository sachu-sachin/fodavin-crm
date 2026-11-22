import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { RoleManager } from "@/components/role-manager";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("roles.manage");

  const [roles, mains, extras] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.profile.findMany({
      where: { role_id: { not: null } },
      select: { id: true, role_id: true },
    }),
    prisma.profileRole.findMany({ select: { profile_id: true, role_id: true } }),
  ]);

  // How many people hold each role, as a main or an additional role — shown
  // so you can see the blast radius before changing or deleting one.
  const holders = new Map<string, Set<string>>();
  for (const { role_id, profile_id } of [
    ...mains.map((m) => ({ role_id: m.role_id as string, profile_id: m.id })),
    ...extras,
  ]) {
    if (!holders.has(role_id)) holders.set(role_id, new Set());
    holders.get(role_id)!.add(profile_id);
  }
  const usageByRole = Object.fromEntries(
    [...holders].map(([roleId, people]) => [roleId, people.size]),
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
