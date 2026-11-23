"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { logCall } from "@/lib/actions/calls";
import { importLeads } from "@/lib/actions/lead-import";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/calls";
import { parseLeadSheet } from "@/lib/call-list";
import { INQUIRY_SOURCES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SELECT = "h-8 rounded-md border border-input bg-transparent px-2 text-sm";

/** One-line call log for a lead in the call list. */
export function QuickLog({ inquiryId, title }: { inquiryId: string; title: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      aria-label={`Log a call with ${title}`}
      action={(fd) =>
        start(async () => {
          const r = await logCall({}, fd);
          if (r.error) toast.error(r.error);
          else {
            toast.success(`Call logged: ${title}`);
            ref.current?.reset();
          }
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <select name="outcome" aria-label="Outcome" className={`${SELECT} w-40`} defaultValue="no_answer">
        {CALL_OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {CALL_OUTCOME_LABELS[o]}
          </option>
        ))}
      </select>
      <Input name="notes" aria-label="Call note" placeholder="Note" className="h-8 min-w-36 flex-1" />
      <Input name="next_follow_up" aria-label="Next follow-up" type="date" className="h-8 w-36" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : "Log"}
      </Button>
    </form>
  );
}

/** Paste rows from Excel / Google Sheets (or pick a CSV) and add them as leads. */
export function ImportLeadsDialog({
  owners,
  currentUserId,
}: {
  owners: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [source, setSource] = useState("cold_outreach");
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parseLeadSheet(text), [text]);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("That file is over 2 MB. Split it, or paste the rows instead.");
      return;
    }
    file.text().then(setText);
  }

  function onImport() {
    start(async () => {
      const r = await importLeads({ rows: parsed.rows, ownerId, source });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const dup = r.duplicates?.length ?? 0;
      toast.success(
        `${r.created} lead${r.created === 1 ? "" : "s"} added${dup ? `, ${dup} skipped (phone already in the pipeline)` : ""}.`,
      );
      setText("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Import leads</Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            Copy the rows from Excel or Google Sheets (with the header row) and paste them here, or pick a CSV file.
            Recognised columns: name/business, contact, phone/mobile, email; anything else goes into notes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            aria-label="Rows to import"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Business Name\tContact Person\tMobile\tArea\nSri Dental Care\tDr. Priya\t98765 43210\tRS Puram"}
            className="font-mono text-xs"
          />
          <Input type="file" accept=".csv,.txt,text/csv" aria-label="CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="import_owner">Owner</Label>
              <select id="import_owner" className={`${SELECT} h-9 w-full`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="import_source">Lead source</Label>
              <select id="import_source" className={`${SELECT} h-9 w-full`} value={source} onChange={(e) => setSource(e.target.value)}>
                {INQUIRY_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {parsed.rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-1.5">Name</th>
                    <th className="p-1.5">Contact</th>
                    <th className="p-1.5">Phone</th>
                    <th className="p-1.5">Email</th>
                    <th className="p-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1.5">{r.title}</td>
                      <td className="p-1.5">{r.contact_name}</td>
                      <td className="p-1.5">{r.phone}</td>
                      <td className="p-1.5">{r.email}</td>
                      <td className="p-1.5">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 8 && (
                <p className="p-1.5 text-xs text-muted-foreground">…and {parsed.rows.length - 8} more</p>
              )}
            </div>
          )}
          {parsed.errors.map((e) => (
            <p key={e} className="text-xs text-destructive">
              {e}
            </p>
          ))}
          <Button onClick={onImport} disabled={pending || parsed.rows.length === 0}>
            {pending ? "Importing…" : `Import ${parsed.rows.length} lead${parsed.rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
