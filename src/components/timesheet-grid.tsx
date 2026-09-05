"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTimeEntry } from "@/lib/actions/timesheet";
import { MAX_HOURS_PER_DAY } from "@/lib/types";
import type { WeekDay } from "@/lib/week";

export interface GridProject {
  id: string;
  name: string;
  companyName: string | null;
}

/** Cell key: `${projectId}:${dateKey}`. */
export type HoursMap = Record<string, number>;

const cellKey = (projectId: string, dateKey: string) =>
  `${projectId}:${dateKey}`;

/** Accepts "7", "7.5" and "7:30", because people type all three. */
function parseHours(raw: string): number | null {
  const value = raw.trim();
  if (value === "") return 0;

  const colon = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;

  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

const fmt = (n: number) =>
  n === 0 ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

export function TimesheetGrid({
  projects,
  days,
  initialHours,
  profileId,
  readOnly = false,
}: {
  projects: GridProject[];
  days: WeekDay[];
  initialHours: HoursMap;
  profileId: string;
  readOnly?: boolean;
}) {
  const [hours, setHours] = useState<HoursMap>(initialHours);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server sends a different week.
  const [prevInitial, setPrevInitial] = useState(initialHours);
  if (prevInitial !== initialHours) {
    setPrevInitial(initialHours);
    setHours(initialHours);
    setDraft({});
  }

  const valueOf = (key: string) =>
    draft[key] !== undefined ? draft[key] : fmt(hours[key] ?? 0);

  function commit(projectId: string, dateKey: string, raw: string) {
    const key = cellKey(projectId, dateKey);
    const parsed = parseHours(raw);

    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });

    if (parsed === null) {
      toast.error("Enter hours as 7, 7.5 or 7:30.");
      return;
    }
    if (parsed > MAX_HOURS_PER_DAY) {
      toast.error(`A day can't hold more than ${MAX_HOURS_PER_DAY} hours.`);
      return;
    }
    if ((hours[key] ?? 0) === parsed) return;

    const previous = hours[key] ?? 0;
    setHours((h) => ({ ...h, [key]: parsed }));
    setSaving(key);

    startTransition(async () => {
      const res = await saveTimeEntry({
        projectId,
        workDate: dateKey,
        hours: parsed,
        profileId,
      });
      setSaving(null);
      if (res.error) {
        // Roll the cell back so the grid never shows an unsaved figure.
        setHours((h) => ({ ...h, [key]: previous }));
        toast.error(res.error);
      }
    });
  }

  const dayTotal = (dateKey: string) =>
    projects.reduce((sum, p) => sum + (hours[cellKey(p.id, dateKey)] ?? 0), 0);

  const rowTotal = (projectId: string) =>
    days.reduce((sum, d) => sum + (hours[cellKey(projectId, d.key)] ?? 0), 0);

  const weekTotal = days.reduce((sum, d) => sum + dayTotal(d.key), 0);

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        No active projects to log against. Create a project first.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="p-3 text-left font-medium">Project</th>
            {days.map((d) => (
              <th
                key={d.key}
                className={`p-2 text-center font-medium ${d.isWeekend ? "text-muted-foreground/60" : ""}`}
              >
                <div>{d.label}</div>
                <div className="text-[10px] font-normal">{d.dayOfMonth}</div>
              </th>
            ))}
            <th className="p-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-b last:border-0">
              <td className="max-w-[220px] p-3">
                <div className="truncate font-medium">{project.name}</div>
                {project.companyName && (
                  <div className="truncate text-xs text-muted-foreground">
                    {project.companyName}
                  </div>
                )}
              </td>
              {days.map((d) => {
                const key = cellKey(project.id, d.key);
                return (
                  <td key={d.key} className="p-1 text-center">
                    <input
                      inputMode="decimal"
                      aria-label={`${project.name}, ${d.label} ${d.dayOfMonth}`}
                      disabled={readOnly}
                      value={valueOf(key)}
                      placeholder="–"
                      onChange={(e) =>
                        setDraft((dr) => ({ ...dr, [key]: e.target.value }))
                      }
                      onBlur={(e) => commit(project.id, d.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          setDraft((dr) => {
                            const next = { ...dr };
                            delete next[key];
                            return next;
                          });
                          e.currentTarget.blur();
                        }
                      }}
                      className={`h-9 w-14 rounded-md border bg-transparent text-center tabular-nums outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 ${
                        d.isWeekend ? "border-dashed" : ""
                      } ${saving === key ? "border-primary/60" : ""}`}
                    />
                  </td>
                );
              })}
              <td className="p-3 text-right font-medium tabular-nums">
                {rowTotal(project.id) || "–"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-medium">
            <td className="p-3 text-left">Daily total</td>
            {days.map((d) => {
              const total = dayTotal(d.key);
              return (
                <td
                  key={d.key}
                  className={`p-3 text-center tabular-nums ${
                    total > MAX_HOURS_PER_DAY ? "text-destructive" : ""
                  }`}
                >
                  {total || "–"}
                </td>
              );
            })}
            <td className="p-3 text-right tabular-nums">{weekTotal || "–"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
