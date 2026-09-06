"use client";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * A row of <select> filters (plus an optional text search box), fully
 * controlled by the caller. Filtering itself happens in-memory over an
 * already-fetched list (see e.g. crm-client-list.tsx), so there's nothing to
 * debounce or push to a router — every change is just local state, applied
 * instantly with no network round trip.
 */
export function ListFilterBar({
  filters,
  search,
  values,
  onFilterChange,
  onSearchChange,
  onClear,
  exportHref,
}: {
  filters: FilterDef[];
  search?: { key: string; placeholder: string; value: string };
  values: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onSearchChange?: (value: string) => void;
  onClear: () => void;
  /** Export CSV link; carries the current filters forward via its own query string set by the caller. */
  exportHref: string;
}) {
  const hasActiveFilters =
    (search && search.value) || filters.some((f) => values[f.key]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {search && (
        <input
          type="text"
          aria-label={search.placeholder}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="h-9 w-48 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      )}
      {filters.map((f) => (
        <select
          key={f.key}
          aria-label={f.label}
          value={values[f.key] ?? ""}
          onChange={(e) => onFilterChange(f.key, e.target.value)}
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
          onClick={onClear}
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
