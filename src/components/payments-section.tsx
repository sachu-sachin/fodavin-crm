"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMilestoneStatus } from "@/lib/actions/finance";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_MAP,
  type MilestoneStatus,
  type PaymentMilestone,
} from "@/lib/types";
import { formatDateKey, formatINR } from "@/lib/format";
import { MilestoneFormDialog } from "@/components/milestone-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sum = (list: PaymentMilestone[]) =>
  list.reduce((total, m) => total + m.amount, 0);

export function PaymentsSection({
  projectId,
  milestones,
  budget,
  today,
}: {
  projectId: string;
  milestones: PaymentMilestone[];
  budget: number | null;
  /** Today's IST date key, resolved on the server so SSR and client agree. */
  today: string;
}) {
  const [, startTransition] = useTransition();

  const received = sum(milestones.filter((m) => m.status === "paid"));
  const outstanding = sum(milestones.filter((m) => m.status !== "paid"));
  const scheduled = received + outstanding;
  // Quoted money that hasn't been broken into a milestone yet.
  const unscheduled = budget == null ? 0 : budget - scheduled;

  function onStatusChange(id: string, status: MilestoneStatus) {
    startTransition(async () => {
      await setMilestoneStatus(id, status);
      if (status === "paid") toast.success("Marked paid");
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Payments</CardTitle>
        <MilestoneFormDialog
          projectId={projectId}
          trigger={
            <Button size="sm" variant="outline">
              Add milestone
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No payment milestones yet. Add one to track what this client owes.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure label="Received" value={received} tone="text-emerald-600 dark:text-emerald-400" />
              <Figure
                label="Outstanding"
                value={outstanding}
                tone={outstanding > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
              />
              <Figure label="Scheduled" value={scheduled} />
            </div>

            {budget != null && unscheduled !== 0 && (
              <p className="mb-4 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {unscheduled > 0 ? (
                  <>
                    {formatINR(unscheduled)} of the {formatINR(budget)}{" "}
                    quote isn&apos;t scheduled into a milestone yet.
                  </>
                ) : (
                  <>
                    Milestones exceed the {formatINR(budget)} quote by{" "}
                    {formatINR(Math.abs(unscheduled))}.
                  </>
                )}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Milestone</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 font-medium">Due</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => {
                    const overdue =
                      m.status !== "paid" &&
                      m.due_date != null &&
                      m.due_date < today;
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2">
                          <div className="font-medium">{m.label}</div>
                          {m.invoice_no && (
                            <div className="text-xs text-muted-foreground">
                              Invoice {m.invoice_no}
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatINR(m.amount)}
                        </td>
                        <td className="py-2">
                          {m.status === "paid" && m.paid_on ? (
                            <span className="text-xs text-muted-foreground">
                              Paid {formatDateKey(m.paid_on)}
                            </span>
                          ) : m.due_date ? (
                            <span
                              className={
                                overdue
                                  ? "text-xs font-medium text-destructive"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {overdue && "Overdue · "}
                              {formatDateKey(m.due_date)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          <select
                            value={m.status}
                            onChange={(e) =>
                              onStatusChange(
                                m.id,
                                e.target.value as MilestoneStatus,
                              )
                            }
                            aria-label={`Status for ${m.label}`}
                            className={`h-7 rounded-md border-0 px-2 text-xs font-medium ${
                              MILESTONE_STATUS_MAP[m.status].badge
                            }`}
                          >
                            {MILESTONE_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 text-right">
                          <MilestoneFormDialog
                            projectId={projectId}
                            milestone={m}
                            trigger={
                              <Button size="sm" variant="ghost">
                                Edit
                              </Button>
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 font-semibold ${tone ?? ""}`}>
        {formatINR(value)}
      </p>
    </div>
  );
}
