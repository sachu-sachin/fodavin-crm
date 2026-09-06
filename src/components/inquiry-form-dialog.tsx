"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createInquiry,
  updateInquiry,
  deleteInquiry,
  convertInquiryToProject,
} from "@/lib/actions/crm";
import { useGuardedForm } from "@/hooks/use-unsaved-changes-guard";
import {
  INQUIRY_SOURCES,
  INQUIRY_STAGES,
  INQUIRY_TYPES,
  type Inquiry,
  type InquiryStage,
} from "@/lib/types";
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

export type InquiryContact = {
  id: string;
  name: string;
  company_id: string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function InquiryFormDialog({
  companies,
  contacts,
  inquiry,
  trigger,
  nativeTrigger = true,
}: {
  companies: { id: string; name: string }[];
  contacts: InquiryContact[];
  inquiry?: Inquiry;
  trigger: React.ReactElement;
  nativeTrigger?: boolean;
}) {
  const isEdit = !!inquiry;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const { formRef, markClean } = useGuardedForm(open);

  // Tracked so the contact list narrows to the chosen client, and so the
  // follow-up / lost-reason fields follow the stage.
  const [companyId, setCompanyId] = useState(inquiry?.company_id ?? "");
  const [contactId, setContactId] = useState(inquiry?.contact_id ?? "");
  const [stage, setStage] = useState<InquiryStage>(inquiry?.stage ?? "new");

  // Dragging a card on the board changes its stage without remounting this
  // dialog. Re-sync from the server copy so saving can't write a stale stage.
  const [prevInquiry, setPrevInquiry] = useState(inquiry);
  if (prevInquiry !== inquiry) {
    setPrevInquiry(inquiry);
    setCompanyId(inquiry?.company_id ?? "");
    setContactId(inquiry?.contact_id ?? "");
    setStage(inquiry?.stage ?? "new");
  }

  const contactOptions = companyId
    ? contacts.filter((c) => c.company_id === companyId)
    : contacts;
  const isClosed = stage === "won" || stage === "lost";

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateInquiry : createInquiry)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        markClean();
        setOpen(false);
      }
    });
  }

  function onDelete() {
    if (!inquiry) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", inquiry.id);
      await deleteInquiry(fd);
      toast.success("Inquiry deleted");
      markClean();
      setOpen(false);
    });
  }

  function onConvert() {
    if (!inquiry) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", inquiry.id);
      // Redirects to the new project on success.
      await convertInquiryToProject(fd);
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={inquiry?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={nativeTrigger} render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit inquiry" : "New inquiry"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={onAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={inquiry.id} />}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Marketing site redesign"
              defaultValue={inquiry?.title ?? ""}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                className={selectClass}
                defaultValue={inquiry?.type ?? "website"}
              >
                {INQUIRY_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Est. budget (₹)</Label>
              <Input
                id="budget"
                name="budget"
                inputMode="decimal"
                placeholder="0"
                defaultValue={inquiry?.budget ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="company_id">Company</Label>
              <select
                id="company_id"
                name="company_id"
                className={selectClass}
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setContactId("");
                }}
              >
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Lead source</Label>
              <select
                id="source"
                name="source"
                className={selectClass}
                defaultValue={inquiry?.source ?? ""}
              >
                <option value="">— Unknown —</option>
                {INQUIRY_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_id">Contact</Label>
            <select
              id="contact_id"
              name="contact_id"
              className={selectClass}
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">— Not in the directory —</option>
              {contactOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!contactId && (
              <Input
                name="contact_name"
                placeholder="Contact name (free text)"
                defaultValue={inquiry?.contact_name ?? ""}
              />
            )}
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <select
                id="stage"
                name="stage"
                className={selectClass}
                value={stage}
                onChange={(e) => setStage(e.target.value as InquiryStage)}
              >
                {INQUIRY_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isClosed && (
            <div className="space-y-2">
              <Label htmlFor="next_follow_up">Next follow-up</Label>
              <Input
                id="next_follow_up"
                name="next_follow_up"
                type="date"
                defaultValue={inquiry?.next_follow_up ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty and this lead won&apos;t appear in your follow-up
                list.
              </p>
            </div>
          )}
          {stage === "lost" && (
            <div className="space-y-2">
              <Label htmlFor="lost_reason">Why was it lost?</Label>
              <Input
                id="lost_reason"
                name="lost_reason"
                placeholder="e.g. Budget too high, went with in-house"
                defaultValue={inquiry?.lost_reason ?? ""}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={inquiry?.notes ?? ""}
            />
          </div>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onConvert}
              disabled={pending}
            >
              Convert to project →
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={onDelete}
                disabled={pending}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create inquiry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
