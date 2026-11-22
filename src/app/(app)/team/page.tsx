import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLES_INCLUDE, rolesOf } from "@/lib/roles";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function TeamPage() {
  await requirePermission("team.view");
  const data = await prisma.profile.findMany({
    where: { is_active: true },
    include: { ...ROLES_INCLUDE, reports_to: { select: { full_name: true, email: true } } },
    orderBy: { created_at: "asc" },
  });

  const members = data.map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
    avatar_url: m.avatar_url,
    roles: rolesOf(m).map((r) => ({ id: r.id, name: r.name, is_admin: r.is_admin })),
    lead: m.reports_to
      ? m.reports_to.full_name || m.reports_to.email?.split("@")[0] || "User"
      : null,
  }));

  return (
    <div>
      <PageHeader title="Team" description="Everyone at Fodavin." />
      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No team members yet. An admin can add them under Employees.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const name = m.full_name || m.email?.split("@")[0] || "User";
            return (
              <Card key={m.id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <Avatar className="h-10 w-10">
                    {m.avatar_url && (
                      <AvatarImage src={m.avatar_url} alt={name} />
                    )}
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.email}
                    </p>
                    {m.lead && (
                      <p className="truncate text-xs text-muted-foreground">
                        Reports to {m.lead}
                      </p>
                    )}
                  </div>
                  <div className="flex max-w-[45%] flex-wrap justify-end gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r.id} variant={r.is_admin ? "default" : "secondary"}>
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
