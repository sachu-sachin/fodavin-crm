import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/auth";
import { formatDateKey, formatDateTimeIST, formatINR, toISTInputValue } from "@/lib/format";
import { INQUIRY_SOURCES, INQUIRY_STAGES, INQUIRY_TYPES } from "@/lib/types";
import { CALL_OUTCOME_LABELS } from "@/lib/calls";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddRecordingButton, DeleteCallButton, LogCallForm } from "@/components/call-log-form";

export const dynamic = "force-dynamic";

const label = <T extends string>(list: { value: T; label: string }[], v: T | null) =>
  list.find((x) => x.value === v)?.label ?? v ?? "—";
const nameOf = (p: { full_name: string | null; email: string | null } | null) =>
  p ? p.full_name || p.email?.split("@")[0] || "User" : null;

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("pipeline.view");
  const { id } = await params;

  const [lead, driveAccount] = await Promise.all([
    prisma.inquiry.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { full_name: true, phone: true, email: true } },
        owner: { select: { full_name: true, email: true } },
        calls: {
          orderBy: { called_at: "desc" },
          include: {
            logger: { select: { full_name: true, email: true } },
            recordings: { select: { id: true, name: true, size_bytes: true } },
          },
        },
      },
    }),
    prisma.googleAccount.findUnique({ where: { singleton: true }, select: { id: true } }),
  ]);
  if (!lead) notFound();

  const canLog = can(session, "pipeline.manage");
  const canUpload = canLog && can(session, "documents.upload");
  const canDelete = can(session, "pipeline.delete");
  const canPlay = can(session, "documents.view");
  const phone = lead.phone ?? lead.contact?.phone ?? null;
  const email = lead.email ?? lead.contact?.email ?? null;
  const person = lead.contact?.full_name ?? lead.contact_name;

  return (
    <div>
      <PageHeader title={lead.title} description={lead.company ? lead.company.name : "Lead"}>
        <Link href="/pipeline" className="text-sm text-muted-foreground hover:underline">
          ← Pipeline
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Stage">
              <Badge variant="secondary">{label(INQUIRY_STAGES, lead.stage)}</Badge>
            </Row>
            <Row k="Owner">{nameOf(lead.owner) ?? "Unassigned"}</Row>
            <Row k="Contact">{person ?? "—"}</Row>
            <Row k="Phone">{phone ? <a className="text-primary hover:underline" href={`tel:${phone}`}>{phone}</a> : "—"}</Row>
            <Row k="Email">{email ? <a className="text-primary hover:underline" href={`mailto:${email}`}>{email}</a> : "—"}</Row>
            <Row k="Client">
              {lead.company ? (
                <Link className="text-primary hover:underline" href={`/crm/${lead.company.id}`}>
                  {lead.company.name}
                </Link>
              ) : (
                "—"
              )}
            </Row>
            <Row k="Type">{label(INQUIRY_TYPES, lead.type)}</Row>
            <Row k="Source">{label(INQUIRY_SOURCES, lead.source)}</Row>
            {can(session, "pipeline.view") && lead.budget != null && (
              <Row k="Est. budget">{formatINR(Number(lead.budget))}</Row>
            )}
            <Row k="Next follow-up">{lead.next_follow_up ? formatDateKey(lead.next_follow_up.toISOString().slice(0, 10)) : "—"}</Row>
            {lead.lost_reason && <Row k="Lost because">{lead.lost_reason}</Row>}
            {lead.notes && <p className="whitespace-pre-wrap pt-2 text-muted-foreground">{lead.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {canLog && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Log a call</CardTitle>
              </CardHeader>
              <CardContent>
                <LogCallForm
                  inquiryId={lead.id}
                  nowValue={toISTInputValue(new Date().toISOString())}
                  maxBucketBytes={MAX_UPLOAD_BYTES}
                  driveConnected={!!driveAccount}
                  canUpload={canUpload}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Calls ({lead.calls.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lead.calls.length === 0 && <p className="text-sm text-muted-foreground">No calls logged yet.</p>}
              {lead.calls.map((c) => (
                <div key={c.id} className="border-b pb-3 text-sm last:border-0" data-call={c.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatDateTimeIST(c.called_at.toISOString())}</span>
                      <Badge variant="outline">{c.direction === "outgoing" ? "Outgoing" : "Incoming"}</Badge>
                      <Badge variant={c.outcome === "not_interested" ? "destructive" : "secondary"}>
                        {CALL_OUTCOME_LABELS[c.outcome]}
                      </Badge>
                      {c.duration_minutes != null && <span className="text-muted-foreground">{c.duration_minutes} min</span>}
                    </div>
                    <div className="flex items-center">
                      {canUpload && (
                        <AddRecordingButton callId={c.id} maxBucketBytes={MAX_UPLOAD_BYTES} driveConnected={!!driveAccount} />
                      )}
                      {canDelete && <DeleteCallButton id={c.id} />}
                    </div>
                  </div>
                  {c.notes && <p className="mt-1 whitespace-pre-wrap">{c.notes}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nameOf(c.logger) ? `Logged by ${nameOf(c.logger)}` : ""}
                    {c.next_follow_up ? ` · follow up ${formatDateKey(c.next_follow_up.toISOString().slice(0, 10))}` : ""}
                  </p>
                  {c.recordings.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {c.recordings.map((r) => (
                        <li key={r.id}>
                          {canPlay ? (
                            <a className="text-primary hover:underline" href={`/api/documents/${r.id}`} target="_blank" rel="noreferrer">
                              ▶ {r.name}
                            </a>
                          ) : (
                            <span>{r.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
