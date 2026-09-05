"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createContact, updateContact } from "@/lib/actions/crm";
import type { Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ContactFormDialog({
  companyId,
  contact,
  trigger,
}: {
  companyId: string;
  contact?: Contact;
  trigger: React.ReactElement;
}) {
  const isEdit = !!contact;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateContact : createContact)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>
        <form action={onAction} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          {isEdit && <input type="hidden" name="id" value={contact.id} />}
          <div className="space-y-2">
            <Label htmlFor="full_name">Name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={contact?.full_name ?? ""}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contact?.email ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={contact?.phone ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role_title">Role / title</Label>
            <Input
              id="role_title"
              name="role_title"
              placeholder="e.g. Marketing Lead"
              defaultValue={contact?.role_title ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={contact?.notes ?? ""}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
