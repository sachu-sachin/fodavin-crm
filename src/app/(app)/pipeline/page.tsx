import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import type { Inquiry } from "@/lib/types";
import { istToday } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InquiryBoard } from "@/components/inquiry-board";
import { InquiryFormDialog } from "@/components/inquiry-form-dialog";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function PipelinePage() {
  await requirePermission("pipeline.view");
  const [raw, companies, contactRows] = await Promise.all([
    prisma.inquiry.findMany({
      orderBy: [{ stage: "asc" }, { created_at: "desc" }],
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      select: { id: true, full_name: true, company_id: true },
      orderBy: { full_name: "asc" },
    }),
  ]);

  // Prisma Decimal / Date aren't serializable to Client Components — flatten.
  const inquiries: Inquiry[] = raw.map((i) => ({
    ...i,
    budget: i.budget == null ? null : Number(i.budget),
    next_follow_up: dateStr(i.next_follow_up),
    created_at: i.created_at.toISOString(),
    updated_at: i.updated_at.toISOString(),
  }));

  const contacts = contactRows.map((c) => ({
    id: c.id,
    name: c.full_name,
    company_id: c.company_id,
  }));

  return (
    <div>
      <PageHeader
        title="Project Inquiries"
        description="Drag inquiries between stages as they progress."
      >
        <InquiryFormDialog
          companies={companies}
          contacts={contacts}
          trigger={<Button>New inquiry</Button>}
        />
      </PageHeader>

      {inquiries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No inquiries yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first project inquiry to start tracking the pipeline.
          </p>
        </div>
      ) : (
        <InquiryBoard
          inquiries={inquiries}
          companies={companies}
          contacts={contacts}
          today={istToday()}
        />
      )}
    </div>
  );
}
