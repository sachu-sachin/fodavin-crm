import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import {
  EmployeeManager,
  type EmployeeRow,
  type RoleOption,
} from "@/components/employee-manager";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await requirePermission("employees.manage");

  const [employees, roles] = await Promise.all([
    prisma.profile.findMany({
      select: {
        id: true,
        full_name: true,
        email: true,
        is_active: true,
        role_id: true,
        reports_to_id: true,
        extra_roles: { select: { role_id: true } },
      },
      orderBy: { created_at: "asc" },
    }),
    prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Plain, named fields only: nothing from Prisma is spread into props.
  const rows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    name: e.full_name || e.email?.split("@")[0] || "User",
    email: e.email,
    is_active: e.is_active,
    role_id: e.role_id,
    extra_role_ids: e.extra_roles.map((r) => r.role_id),
    reports_to_id: e.reports_to_id,
  }));
  const roleOptions: RoleOption[] = roles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Create accounts, assign roles and reporting leads. Admins only."
      />
      <EmployeeManager
        employees={rows}
        roles={roleOptions}
        currentUserId={session.userId}
      />
    </div>
  );
}
