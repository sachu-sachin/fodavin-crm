import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PROJECT_TYPES, PROJECT_PHASES } from "@/lib/types";
import type { Company, Contact, DocumentRecord } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { CompanyFormDialog } from "@/components/company-form-dialog";
import { ContactsSection } from "@/components/contacts-section";
import { DocumentsSection } from "@/components/documents-section";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { getConnectedAccount } from "@/lib/google/drive";
import { SUPABASE_MAX_BYTES } from "@/lib/google/config";
import { deleteCompany } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const typeLabel = (v: string) =>
  PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) =>
  PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("clients.view");
  const { id } = await params;

  const [company, profiles, driveAccount] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { created_at: "asc" } },
        projects: { orderBy: { created_at: "desc" } },
        documents: { orderBy: { created_at: "desc" } },
      },
    }),
    prisma.profile.findMany({ select: { id: true, full_name: true, email: true } }),
    getConnectedAccount(),
  ]);

  if (!company) notFound();

  const uploaderNames = Object.fromEntries(
    profiles.map((p) => [
      p.id,
      p.full_name || p.email?.split("@")[0] || "User",
    ]),
  );

  const documents: DocumentRecord[] = company.documents.map((d) => ({
    ...d,
    created_at: d.created_at.toISOString(),
    updated_at: d.updated_at.toISOString(),
  }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/crm"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to clients
        </Link>
      </div>

      <PageHeader title={company.name} description={company.industry ?? undefined}>
        <CompanyFormDialog
          company={company as unknown as Company}
          trigger={<Button variant="outline">Edit</Button>}
        />
        <DeleteEntityButton
          action={deleteCompany}
          id={company.id}
          entity="client"
          name={company.name}
          impacts={[
            { label: "contact", count: company.contacts.length },
            { label: "document", count: documents.length },
          ]}
          extraWarning={
            company.projects.length > 0
              ? `Its ${company.projects.length} project${company.projects.length === 1 ? "" : "s"} will be kept, but no longer linked to a client.`
              : undefined
          }
        />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ContactsSection
            companyId={company.id}
            contacts={company.contacts as unknown as Contact[]}
          />

          <DocumentsSection
            companyId={company.id}
            documents={documents}
            uploaderNames={uploaderNames}
            driveConnected={!!driveAccount}
            supabaseMaxBytes={SUPABASE_MAX_BYTES}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Projects ({company.projects.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {company.projects.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No projects yet.
                </p>
              ) : (
                company.projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-3 hover:border-primary/50"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="flex gap-2">
                      <Badge variant="secondary">{typeLabel(p.type)}</Badge>
                      <Badge variant="outline">{phaseLabel(p.phase)}</Badge>
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Website">
                {company.website ? (
                  <a
                    href={
                      company.website.startsWith("http")
                        ? company.website
                        : `https://${company.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {company.website}
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Industry">{company.industry ?? "—"}</Detail>
              <Detail label="GSTIN">
                <span className="font-mono text-xs">
                  {company.gstin ?? "—"}
                </span>
              </Detail>
              <Detail label="Notes">
                <span className="whitespace-pre-wrap">
                  {company.notes ?? "—"}
                </span>
              </Detail>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
