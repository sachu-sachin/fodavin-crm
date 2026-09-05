import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TimeByPerson {
  name: string;
  hours: number;
}

/**
 * Time logged on a project, and what it implies about profitability.
 *
 * The honest metric available without payroll data is the *effective hourly
 * rate*: what the client is paying divided by the hours actually spent. It
 * needs no salary figures, and it's the number that tells you which kinds of
 * work to stop taking.
 */
export function ProjectTimeCard({
  totalHours,
  byPerson,
  budget,
  received,
}: {
  totalHours: number;
  byPerson: TimeByPerson[];
  budget: number | null;
  received: number;
}) {
  const quotedRate =
    budget != null && totalHours > 0 ? budget / totalHours : null;
  const realisedRate = totalHours > 0 ? received / totalHours : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {totalHours === 0 ? (
          <p className="py-2 text-muted-foreground">
            No hours logged yet. The team can log time under Timesheet.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Hours logged</span>
              <span className="text-lg font-semibold tabular-nums">
                {totalHours.toFixed(2).replace(/\.00$/, "")}
              </span>
            </div>

            {quotedRate != null && (
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Rate vs. quote</span>
                <span className="font-medium tabular-nums">
                  {formatINR(Math.round(quotedRate))}/hr
                </span>
              </div>
            )}

            {realisedRate != null && received > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Rate vs. received</span>
                <span className="font-medium tabular-nums">
                  {formatINR(Math.round(realisedRate))}/hr
                </span>
              </div>
            )}

            {byPerson.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  By person
                </p>
                <ul className="space-y-1">
                  {byPerson.map((person) => (
                    <li
                      key={person.name}
                      className="flex justify-between text-sm"
                    >
                      <span className="truncate">{person.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {person.hours.toFixed(2).replace(/\.00$/, "")} h
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
