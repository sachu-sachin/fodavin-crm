import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ProfileWithRole } from "@/lib/types";

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
    include: { role: true },
    orderBy: { created_at: "asc" },
  });

  const members = data as unknown as ProfileWithRole[];

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
                  </div>
                  {m.role?.name && (
                    <Badge variant={m.role.is_admin ? "default" : "secondary"}>
                      {m.role.name}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
