"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListFilterBar } from "@/components/list-filter-bar";
import { BarChart } from "@/components/ui/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  _count: { contacts: number; projects: number };
};

function hostname(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

export function CrmClientList({ companies }: { companies: CompanyRow[] }) {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) if (c.industry) set.add(c.industry);
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (industry && c.industry !== industry) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, search, industry]);

  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const key = c.industry?.trim() || "Unspecified";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (industry) params.set("industry", industry);
    if (search) params.set("q", search);
    return `/api/reports/clients?${params.toString()}`;
  }, [industry, search]);

  const hasFilters = !!(industry || search);

  return (
    <>
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
        search={{ key: "q", placeholder: "Search by name…", value: search }}
        onSearchChange={setSearch}
        filters={[{ key: "industry", label: "Industry", options: industries }]}
        values={{ industry }}
        onFilterChange={(_key, value) => setIndustry(value)}
        onClear={() => {
          setSearch("");
          setIndustry("");
        }}
        exportHref={exportHref}
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            {hasFilters ? "No clients match these filters" : "No clients yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try clearing a filter."
              : "Add your first company to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
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
    </>
  );
}
