"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetEmployeePassword } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PasswordResetDialog({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await resetEmployeePassword({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Password updated.");
        setError(undefined);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Reset password
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <form action={onAction} className="space-y-4">
          <input type="hidden" name="id" value={employeeId} />
          <p className="text-sm text-muted-foreground">
            Set a new password for <span className="font-medium">{employeeName}</span>.
            They can sign in with it immediately.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`password-${employeeId}`}>New password</Label>
            <Input
              id={`password-${employeeId}`}
              name="password"
              type="text"
              minLength={8}
              placeholder="min. 8 characters"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
