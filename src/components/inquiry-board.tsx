"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { moveInquiryStage } from "@/lib/actions/crm";
import {
  INQUIRY_STAGES,
  INQUIRY_TYPES,
  type Inquiry,
  type InquiryStage,
  type InquiryType,
} from "@/lib/types";
import { formatDateKey, formatINR } from "@/lib/format";
import {
  InquiryFormDialog,
  type InquiryContact,
} from "@/components/inquiry-form-dialog";
import { Badge } from "@/components/ui/badge";

const TYPE_LABELS = Object.fromEntries(
  INQUIRY_TYPES.map((t) => [t.value, t.label]),
) as Record<InquiryType, string>;

export function InquiryBoard({
  inquiries,
  companies,
  contacts,
  owners = [],
  today,
}: {
  inquiries: Inquiry[];
  companies: { id: string; name: string }[];
  contacts: InquiryContact[];
  owners?: { id: string; name: string }[];
  /** Today's IST date key, resolved on the server so SSR and client agree. */
  today: string;
}) {
  const [items, setItems] = useState(inquiries);
  const [prevInquiries, setPrevInquiries] = useState(inquiries);
  const [dragOver, setDragOver] = useState<InquiryStage | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync with server truth after each revalidation (adjust state during
  // render rather than in an effect).
  if (prevInquiries !== inquiries) {
    setPrevInquiries(inquiries);
    setItems(inquiries);
  }

  const ownerName = (id: string) => owners.find((o) => o.id === id)?.name ?? "Former employee";
  const companyName = (id: string | null) =>
    id ? companies.find((c) => c.id === id)?.name : null;

  function handleDrop(stage: InquiryStage, id: string) {
    setDragOver(null);
    const item = items.find((i) => i.id === id);
    if (!item || item.stage === stage) return;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, stage } : i)),
    );
    startTransition(() => moveInquiryStage(id, stage));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {INQUIRY_STAGES.map((stage) => {
        const columnItems = items.filter((i) => i.stage === stage.value);
        const total = columnItems.reduce((sum, i) => sum + (i.budget ?? 0), 0);
        return (
          <div
            key={stage.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage.value);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage.value, e.dataTransfer.getData("text/plain"));
            }}
            className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${
              dragOver === stage.value ? "border-primary ring-1 ring-primary" : ""
            }`}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{stage.label}</span>
              <span className="text-xs text-muted-foreground">
                {columnItems.length}
                {total > 0 && ` · ${formatINR(total)}`}
              </span>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {columnItems.map((inquiry) => {
                const followUp = inquiry.next_follow_up;
                const overdue = followUp != null && followUp <= today;
                return (
                <InquiryFormDialog
                  key={inquiry.id}
                  companies={companies}
                  contacts={contacts}
                  owners={owners}
                  inquiry={inquiry}
                  nativeTrigger={false}
                  trigger={
                    <div
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", inquiry.id)
                      }
                      className="cursor-grab rounded-md border bg-card p-3 shadow-sm active:cursor-grabbing hover:border-primary/50"
                    >
                      <p className="text-sm font-medium">{inquiry.title}</p>
                      {companyName(inquiry.company_id) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {companyName(inquiry.company_id)}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">
                          {TYPE_LABELS[inquiry.type]}
                        </Badge>
                        {inquiry.budget != null && (
                          <span className="text-xs font-medium">
                            {formatINR(inquiry.budget)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-muted-foreground">
                          {inquiry.owner_id ? ownerName(inquiry.owner_id) : "Unassigned"}
                        </span>
                        <Link
                          href={`/pipeline/${inquiry.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 font-medium text-primary hover:underline"
                        >
                          Calls →
                        </Link>
                      </div>
                      {followUp && (
                        <p
                          className={`mt-2 text-[11px] ${
                            overdue
                              ? "font-medium text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {overdue ? "Follow up due " : "Follow up "}
                          {formatDateKey(followUp)}
                        </p>
                      )}
                    </div>
                  }
                />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
