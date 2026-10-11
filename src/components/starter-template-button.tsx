"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { addStarterTemplate } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";

export function StarterTemplateButton({
  variant = "outline",
}: {
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await addStarterTemplate();
          if (res.error) toast.error(res.error);
          else toast.success(res.success ?? "Added");
        })
      }
    >
      {pending ? "Adding…" : "Add starter template"}
    </Button>
  );
}
