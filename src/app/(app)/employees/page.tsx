import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmployeeManager } from "@/components/employee-manager";
import type { ProfileWithRole, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await requirePermission("employees.manage");

  const [employees, roles] = await Promise.all([
    prisma.profile.findMany({
      include: { role: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Create accounts and assign roles. Admins only."
      />
      <EmployeeManager
        employees={employees as unknown as ProfileWithRole[]}
        roles={roles as unknown as Role[]}
        currentUserId={session.userId}
      />
    </div>
  );
}
