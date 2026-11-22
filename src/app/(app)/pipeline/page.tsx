import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import type { Inquiry } from "@/lib/types";
import { istToday } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InquiryBoard } from "@/components/inquiry-board";
import { InquiryFormDialog } from "@/components/inquiry-form-dialog";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePermission("pipeline.view");
  const mine = (await searchParams).mine === "1";
  const [raw, companies, contactRows, people] = await Promise.all([
    prisma.inquiry.findMany({
      where: mine ? { owner_id: session.userId } : {},
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
    prisma.profile.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true, email: true },
      orderBy: { full_name: "asc" },
    }),
  ]);
  const owners = people.map((p) => ({ id: p.id, name: p.full_name || p.email?.split("@")[0] || "User" }));

  // Prisma Decimal / Date aren't serializable to Client Components — flatten.
  const inquiries: Inquiry[] = raw.map((i) => ({
    id: i.id,
    title: i.title,
    company_id: i.company_id,
    contact_id: i.contact_id,
    contact_name: i.contact_name,
    type: i.type,
    source: i.source,
    budget: i.budget == null ? null : Number(i.budget),
    stage: i.stage,
    position: i.position,
    next_follow_up: dateStr(i.next_follow_up),
    lost_reason: i.lost_reason,
    notes: i.notes,
    owner_id: i.owner_id,
    phone: i.phone,
    email: i.email,
    created_by: i.created_by,
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
        title="Leads"
        description="Every enquiry from first call to won or lost. Open a lead to log calls and recordings."
      >
        <Link
          href={mine ? "/pipeline" : "/pipeline?mine=1"}
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
        >
          {mine ? "All leads" : "My leads"}
        </Link>
        <InquiryFormDialog
          companies={companies}
          contacts={contacts}
          owners={owners}
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
          owners={owners}
          today={istToday()}
        />
      )}
    </div>
  );
}
