"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { copyPreviousWeek } from "@/lib/actions/timesheet";
import { Button } from "@/components/ui/button";

export function TimesheetToolbar({
  weekStart,
  previousWeekStart,
  nextWeekStart,
  currentWeekStart,
  rangeLabel,
  profileId,
  people,
  canSwitchPerson,
  readOnly,
}: {
  weekStart: string;
  previousWeekStart: string;
  nextWeekStart: string;
  currentWeekStart: string;
  rangeLabel: string;
  profileId: string;
  people: { id: string; name: string }[];
  canSwitchPerson: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Changing week is a navigation, and until the new week renders this
  // toolbar still holds the old week's props. Tracking it as a transition
  // lets everything here stay disabled meanwhile — otherwise a quick "Next
  // week" then "Copy last week" would copy into the week being left, and a
  // second "Next week" would skip one.
  const [navigating, startNavigation] = useTransition();
  const busy = pending || navigating;

  const isCurrentWeek = weekStart === currentWeekStart;

  function go(week: string, person = profileId) {
    const params = new URLSearchParams({ week });
    if (canSwitchPerson) params.set("person", person);
    startNavigation(() => router.push(`/timesheet?${params}`));
  }

  function onCopy() {
    startTransition(async () => {
      const res = await copyPreviousWeek({
        weekStart,
        previousWeekStart,
        profileId,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(res.success ?? "Copied");
        router.refresh();
      }
    });
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3"
      aria-busy={busy}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(previousWeekStart)}
          disabled={busy}
          aria-label="Previous week"
        >
          ←
        </Button>
        <span
          className={`min-w-[10rem] text-center text-sm font-medium transition-opacity ${
            navigating ? "opacity-50" : ""
          }`}
        >
          {rangeLabel}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(nextWeekStart)}
          disabled={busy}
          aria-label="Next week"
        >
          →
        </Button>
        {!isCurrentWeek && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(currentWeekStart)}
            disabled={busy}
          >
            This week
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canSwitchPerson && (
          <select
            value={profileId}
            onChange={(e) => go(weekStart, e.target.value)}
            disabled={busy}
            aria-label="Whose timesheet"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={busy}
          >
            {pending ? "Copying…" : "Copy last week"}
          </Button>
        )}
      </div>
    </div>
  );
}
