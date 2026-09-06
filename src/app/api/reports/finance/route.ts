import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import { MILESTONE_STATUSES, type MilestoneStatus } from "@/lib/types";
import { formatDateKey } from "@/lib/format";
import type { Prisma } from "@prisma/client";

const label = (v: MilestoneStatus) =>
  MILESTONE_STATUSES.find((s) => s.value === v)?.label ?? v;
const dateStr = (d: Date | null) =>
  d ? formatDateKey(d.toISOString().slice(0, 10)) : null;

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || !can(session, "finance.view")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const projectId = params.get("project");

  const where: Prisma.PaymentMilestoneWhereInput = {
    ...(status ? { status: status as MilestoneStatus } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  };

  const milestones = await prisma.paymentMilestone.findMany({
    where,
    include: {
      project: { select: { name: true, company: { select: { name: true } } } },
    },
    orderBy: { due_date: { sort: "asc", nulls: "last" } },
  });

  const csv = rowsToCsv(
    ["Project", "Company", "Milestone", "Invoice No", "Amount", "Status", "Due", "Paid"],
    milestones.map((m) => [
      m.project.name,
      m.project.company?.name ?? null,
      m.label,
      m.invoice_no,
      Number(m.amount),
      label(m.status),
      dateStr(m.due_date),
      dateStr(m.paid_on),
    ]),
  );

  return csvResponse("finance.csv", csv);
}
