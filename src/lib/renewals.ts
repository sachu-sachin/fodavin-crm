// Renewal urgency for domains and hosting.
//
// All comparisons run on "YYYY-MM-DD" IST date keys, which sort correctly as
// plain strings — no Date objects, so no timezone drift between the server
// render and the client.

import { RENEWAL_WINDOW_DAYS } from "@/lib/types";

export type RenewalState = "expired" | "due" | "ok";

export interface RenewalStatus {
  state: RenewalState;
  /** Negative once expired. */
  daysLeft: number;
  label: string;
}

const DAY_MS = 86_400_000;

export function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`).getTime();
  const to = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

export function renewalStatus(
  expiryKey: string,
  todayKey: string,
): RenewalStatus {
  const daysLeft = daysBetween(todayKey, expiryKey);

  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return {
      state: "expired",
      daysLeft,
      label: ago === 1 ? "Expired yesterday" : `Expired ${ago} days ago`,
    };
  }
  if (daysLeft === 0) return { state: "due", daysLeft, label: "Expires today" };
  if (daysLeft <= RENEWAL_WINDOW_DAYS) {
    return {
      state: "due",
      daysLeft,
      label: daysLeft === 1 ? "Expires tomorrow" : `In ${daysLeft} days`,
    };
  }
  return { state: "ok", daysLeft, label: `In ${daysLeft} days` };
}

export const RENEWAL_TONE: Record<RenewalState, string> = {
  expired: "font-medium text-destructive",
  due: "font-medium text-amber-600 dark:text-amber-400",
  ok: "text-muted-foreground",
};
