import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CompanyFormDialog } from "@/components/company-form-dialog";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("clients.view");

  const params = await searchParams;
  const industry = typeof params.industry === "string" ? params.industry : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;

  const where: Prisma.CompanyWhereInput = {
    ...(industry ? { industry } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [companies, industries, allForChart] = await Promise.all([
    prisma.company.findMany({
      where,
      include: { _count: { select: { contacts: true, projects: true } } },
      orderBy: { created_at: "desc" },
    }),
    prisma.company.findMany({
      where: { industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
    }),
    prisma.company.findMany({ select: { industry: true } }),
  ]);

  const industryCounts = new Map<string, number>();
  for (const c of allForChart) {
    const key = c.industry?.trim() || "Unspecified";
    industryCounts.set(key, (industryCounts.get(key) ?? 0) + 1);
  }
  const chartData = [...industryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const exportParams = new URLSearchParams();
  if (industry) exportParams.set("industry", industry);
  if (search) exportParams.set("q", search);

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your directory of companies and contacts."
      >
        <CompanyFormDialog trigger={<Button>Add company</Button>} />
      </PageHeader>

      {chartData.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients by industry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>
      )}

      <ListFilterBar
        search={{ key: "q", placeholder: "Search by name…" }}
        filters={[
          {
            key: "industry",
            label: "Industry",
            options: industries
              .filter((i) => i.industry)
              .map((i) => ({ value: i.industry!, label: i.industry! })),
          },
        ]}
        exportHref={`/api/reports/clients?${exportParams.toString()}`}
      />

      {companies.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            {industry || search ? "No clients match these filters" : "No clients yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {industry || search
              ? "Try clearing a filter."
              : "Add your first company to get started."}
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
