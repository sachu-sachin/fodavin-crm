// Minimal, dependency-free horizontal bar chart. Uses the --chart-1..5 CSS
// variables already defined in globals.css (light + dark) so it themes for
// free, without pulling in a charting library.
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function BarChart({
  data,
  emptyLabel = "No data yet.",
}: {
  data: { label: string; value: number }[];
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-muted-foreground">
            {d.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: COLORS[i % COLORS.length],
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-medium">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}
