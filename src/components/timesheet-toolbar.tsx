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

  const isCurrentWeek = weekStart === currentWeekStart;

  function go(week: string, person = profileId) {
    const params = new URLSearchParams({ week });
    if (canSwitchPerson) params.set("person", person);
    router.push(`/timesheet?${params}`);
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(previousWeekStart)}
          aria-label="Previous week"
        >
          ←
        </Button>
        <span className="min-w-[10rem] text-center text-sm font-medium">
          {rangeLabel}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(nextWeekStart)}
          aria-label="Next week"
        >
          →
        </Button>
        {!isCurrentWeek && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(currentWeekStart)}
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
            disabled={pending}
          >
            {pending ? "Copying…" : "Copy last week"}
          </Button>
        )}
      </div>
    </div>
  );
}
