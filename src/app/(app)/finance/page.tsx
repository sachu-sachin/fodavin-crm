import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { FinanceClientList } from "@/components/finance-client-list";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await requirePermission("finance.view");

  const [rawMilestones, projects] = await Promise.all([
    prisma.paymentMilestone.findMany({
      include: {
        project: { select: { id: true, name: true, company: { select: { name: true } } } },
      },
      orderBy: { due_date: { sort: "asc", nulls: "last" } },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // amount is a Prisma Decimal — not serializable to a Client Component (see
  // docs/testing.md's Findings), so convert it here before it crosses the
  // boundary rather than only at render time.
  const milestones = rawMilestones.map((m) => ({
    ...m,
    amount: Number(m.amount),
  }));

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Payment milestones and invoices across every project."
      />

      <FinanceClientList milestones={milestones} projects={projects} />
    </div>
  );
}
