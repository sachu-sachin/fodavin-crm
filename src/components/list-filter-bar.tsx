"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * A row of <select> filters (plus an optional text search box) that read
 * from and write to the URL's searchParams, so filters are bookmarkable and
 * the server component re-renders with a filtered query — no client-side
 * over-fetch-then-filter. Follows the same useRouter().push(path?params)
 * pattern already used by TimesheetToolbar.
 */
export function ListFilterBar({
  filters,
  search,
  exportHref,
}: {
  filters: FilterDef[];
  search?: { key: string; placeholder: string };
  /** Export CSV link; carries the current filters forward via its own query string set by the caller. */
  exportHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function onSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam(search!.key, value), 400);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters =
    (search && searchParams.get(search.key)) ||
    filters.some((f) => searchParams.get(f.key));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {search && (
        <input
          type="text"
          aria-label={search.placeholder}
          placeholder={search.placeholder}
          defaultValue={searchParams.get(search.key) ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 w-48 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      )}
      {filters.map((f) => (
        <select
          key={f.key}
          aria-label={f.label}
          value={searchParams.get(f.key) ?? ""}
          onChange={(e) => setParam(f.key, e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      )}
      <a
        href={exportHref}
        className="ml-auto rounded-md border bg-background px-3 py-1.5 text-sm hover:border-primary/50"
      >
        Export CSV
      </a>
    </div>
  );
}
