import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shell for the dashboard's "things needing attention" cards.
 *
 * They all share the same shape — a title, an optional count or figure, an
 * empty state, and a list of links — so the shell lives here and each card
 * supplies only its rows.
 */
export function DashboardCard({
  title,
  count,
  tone = "alert",
  figure,
  empty,
  children,
}: {
  title: string;
  count?: number;
  tone?: "alert" | "warn";
  /** Right-aligned headline value, e.g. a money total. */
  figure?: React.ReactNode;
  empty: string;
  children?: React.ReactNode;
}) {
  const hasRows = !!children;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span className="flex items-baseline gap-2">
            {title}
            {count !== undefined && count > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  tone === "warn"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {count}
              </span>
            )}
          </span>
          {figure}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasRows ? (
          <ul className="divide-y">{children}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** One row: a label on the left, status on the right, linking somewhere. */
export function DashboardRow({
  href,
  primary,
  secondary,
  trailing,
}: {
  href: string;
  primary: string;
  secondary?: string | null;
  trailing: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 py-2 text-sm hover:text-primary"
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{primary}</span>
          {secondary && (
            <span className="ml-2 text-xs text-muted-foreground">
              {secondary}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">{trailing}</span>
      </Link>
    </li>
  );
}
