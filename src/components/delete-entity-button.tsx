"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

export interface DeleteImpact {
  label: string;
  count: number;
}

/**
 * Delete control for a whole record, gated behind a confirmation that spells
 * out the collateral damage.
 *
 * Deleting a project or client cascades a lot — tasks, milestones, documents,
 * logged hours — and the files behind those documents are removed from Drive
 * and storage for real. Listing the counts is the difference between an
 * informed decision and a nasty surprise.
 */
export function DeleteEntityButton({
  action,
  id,
  entity,
  name,
  impacts,
  extraWarning,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  /** e.g. "project" or "client" */
  entity: string;
  name: string;
  impacts: DeleteImpact[];
  extraWarning?: string;
}) {
  const [open, setOpen] = useState(false);

  const real = impacts.filter((i) => i.count > 0);
  const listed = real
    .map((i) => `${i.count} ${i.label}${i.count === 1 ? "" : "s"}`)
    .join(", ");

  const body = [
    `${name} will be permanently deleted.`,
    real.length > 0 ? `This also removes ${listed}.` : null,
    extraWarning,
    "This cannot be undone.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete this ${entity}?`}
        body={body}
        confirmLabel={`Delete ${entity}`}
        onConfirm={async () => {
          const fd = new FormData();
          fd.set("id", id);
          // The action redirects on success, which surfaces here as a thrown
          // navigation signal — let it through rather than treating it as a
          // failure.
          await action(fd);
        }}
      />
    </>
  );
}
