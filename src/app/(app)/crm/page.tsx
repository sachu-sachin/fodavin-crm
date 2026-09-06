import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CompanyFormDialog } from "@/components/company-form-dialog";
import { CrmClientList } from "@/components/crm-client-list";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  await requirePermission("clients.view");

  const companies = await prisma.company.findMany({
    include: { _count: { select: { contacts: true, projects: true } } },
    orderBy: { created_at: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your directory of companies and contacts."
      >
        <CompanyFormDialog trigger={<Button>Add company</Button>} />
      </PageHeader>

      <CrmClientList companies={companies} />
    </div>
  );
}
