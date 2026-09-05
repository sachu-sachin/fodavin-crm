import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CompanyFormDialog } from "@/components/company-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  await requirePermission("clients.view");
  const companies = await prisma.company.findMany({
    include: { _count: { select: { contacts: true, projects: true } } },
    orderBy: { created_at: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your directory of companies and contacts."
      >
        <CompanyFormDialog trigger={<Button>Add company</Button>} />
      </PageHeader>

      {companies.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first company to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Link key={c.id} href={`/crm/${c.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      {c.industry && (
                        <p className="truncate text-sm text-muted-foreground">
                          {c.industry}
                        </p>
                      )}
                    </div>
                    {c.website && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hostname(c.website)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {c._count.contacts} contact
                      {c._count.contacts === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="secondary">
                      {c._count.projects} project
                      {c._count.projects === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function hostname(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}
