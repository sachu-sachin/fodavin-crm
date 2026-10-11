"use client";

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Changing week or person on the timesheet is a client-side navigation, and
 * until the new week renders, the toolbar *and* the grid are still on screen
 * with the old week's props. Anything clicked or typed in that gap acts on
 * the week being left (the copy-week flake in docs/testing.md, Finding 12).
 * This tracks the navigation once for the whole page, so every control can
 * lock while it's in flight.
 */
const TimesheetNavigationContext = createContext<{
  navigating: boolean;
  navigate: (href: string) => void;
} | null>(null);

export function TimesheetNavigation({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const navigate = (href: string) => startNavigation(() => router.push(href));
  return (
    <TimesheetNavigationContext.Provider value={{ navigating, navigate }}>
      {children}
    </TimesheetNavigationContext.Provider>
  );
}

export function useTimesheetNavigation() {
  const ctx = useContext(TimesheetNavigationContext);
  if (!ctx) throw new Error("useTimesheetNavigation must be used inside <TimesheetNavigation>");
  return ctx;
}
