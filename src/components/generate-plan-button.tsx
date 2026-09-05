"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { generateWeeklyPlan } from "@/lib/actions/social";
import { Button } from "@/components/ui/button";

export function GeneratePlanButton() {
  const [pending, startTransition] = useTransition();

  function onClick() {
    const confirmed = window.confirm(
      "Generate a 7-day plan across LinkedIn, Instagram, Facebook and YouTube?\n\nOne post per platform per day using each weekday's theme. Days that already have posts are skipped.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      await generateWeeklyPlan(new FormData());
      toast.success("7-day content plan generated");
    });
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      {pending ? "Generating…" : "Generate 7-day plan"}
    </Button>
  );
}
