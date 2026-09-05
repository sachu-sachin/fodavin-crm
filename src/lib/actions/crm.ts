"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { purgeDocumentFiles } from "@/lib/document-files";
import type {
  InquirySource,
  InquiryStage,
  InquiryType,
  ProjectType,
} from "@/lib/types";

export type CrmState = { error?: string; success?: string };

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

function parseBudget(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

// -- Companies ----------------------------------------------------------------

export async function createCompany(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const userId = await requireUserId("clients.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Company name is required." };

  await prisma.company.create({
    data: {
      name,
      website: str(formData.get("website")),
      industry: str(formData.get("industry")),
      gstin: str(formData.get("gstin")),
      notes: str(formData.get("notes")),
      created_by: userId,
    },
  });

  revalidatePath("/crm");
  return { success: `${name} added.` };
}

export async function updateCompany(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  if (!(await requireUserId("clients.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Company name is required." };

  await prisma.company.update({
    where: { id },
    data: {
      name,
      website: str(formData.get("website")),
      industry: str(formData.get("industry")),
      gstin: str(formData.get("gstin")),
      notes: str(formData.get("notes")),
    },
  });

  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
  return { success: "Company updated." };
}

export async function deleteCompany(formData: FormData): Promise<void> {
  if (!(await requireUserId("clients.delete"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Only the company's own documents cascade — its projects survive with
  // company_id set to null, so their files must be left alone.
  const documents = await prisma.document.findMany({
    where: { company_id: id },
    select: { source: true, storage_path: true, drive_file_id: true },
  });
  await purgeDocumentFiles(documents);

  await prisma.company.delete({ where: { id } });
  revalidatePath("/crm");
  revalidatePath("/");
  redirect("/crm");
}

// -- Contacts -----------------------------------------------------------------

export async function createContact(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const userId = await requireUserId("clients.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const companyId = String(formData.get("company_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Contact name is required." };

  await prisma.contact.create({
    data: {
      company_id: companyId || null,
      full_name: fullName,
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      role_title: str(formData.get("role_title")),
      notes: str(formData.get("notes")),
      created_by: userId,
    },
  });

  revalidatePath(`/crm/${companyId}`);
  return { success: `${fullName} added.` };
}

export async function updateContact(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  if (!(await requireUserId("clients.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Contact name is required." };

  await prisma.contact.update({
    where: { id },
    data: {
      full_name: fullName,
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      role_title: str(formData.get("role_title")),
      notes: str(formData.get("notes")),
    },
  });

  revalidatePath(`/crm/${companyId}`);
  return { success: "Contact updated." };
}

export async function deleteContact(formData: FormData): Promise<void> {
  if (!(await requireUserId("clients.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  await prisma.contact.delete({ where: { id } });
  revalidatePath(`/crm/${companyId}`);
}

// -- Inquiries (pipeline) -----------------------------------------------------

const INQUIRY_TYPES = new Set<InquiryType>([
  "website",
  "web_app",
  "mobile_app",
  "ecommerce",
  "branding",
  "maintenance",
  "other",
]);

const INQUIRY_STAGES = new Set<InquiryStage>([
  "new",
  "contacted",
  "proposal_sent",
  "won",
  "lost",
]);

const INQUIRY_SOURCES = new Set<InquirySource>([
  "referral",
  "website",
  "social",
  "cold_outreach",
  "marketplace",
  "repeat_client",
  "event",
  "other",
]);

/** Validated enum value, or null when unset/unrecognised. */
function optionalSource(v: FormDataEntryValue | null): InquirySource | null {
  const s = String(v ?? "").trim() as InquirySource;
  return INQUIRY_SOURCES.has(s) ? s : null;
}

/** "YYYY-MM-DD" from a <input type="date">, stored as a bare Postgres date. */
function parseDateOnly(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createInquiry(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const userId = await requireUserId("pipeline.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Inquiry title is required." };

  const budget = parseBudget(String(formData.get("budget") ?? ""));
  if (budget === "invalid") return { error: "Budget must be a number." };

  const type = String(formData.get("type") ?? "website") as InquiryType;

  await prisma.inquiry.create({
    data: {
      title,
      company_id: str(formData.get("company_id")),
      contact_id: str(formData.get("contact_id")),
      contact_name: str(formData.get("contact_name")),
      type: INQUIRY_TYPES.has(type) ? type : "website",
      source: optionalSource(formData.get("source")),
      budget,
      next_follow_up: parseDateOnly(formData.get("next_follow_up")),
      notes: str(formData.get("notes")),
      created_by: userId,
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/");
  return { success: `Inquiry "${title}" added.` };
}

export async function updateInquiry(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  if (!(await requireUserId("pipeline.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Inquiry title is required." };

  const budget = parseBudget(String(formData.get("budget") ?? ""));
  if (budget === "invalid") return { error: "Budget must be a number." };

  const type = String(formData.get("type") ?? "website") as InquiryType;
  const rawStage = String(formData.get("stage") ?? "new") as InquiryStage;
  const stage = INQUIRY_STAGES.has(rawStage) ? rawStage : "new";

  await prisma.inquiry.update({
    where: { id },
    data: {
      title,
      company_id: str(formData.get("company_id")),
      contact_id: str(formData.get("contact_id")),
      contact_name: str(formData.get("contact_name")),
      type: INQUIRY_TYPES.has(type) ? type : "website",
      source: optionalSource(formData.get("source")),
      stage,
      budget,
      // A closed inquiry has nothing left to chase; a live one has no reason
      // to carry a lost reason.
      next_follow_up:
        stage === "won" || stage === "lost"
          ? null
          : parseDateOnly(formData.get("next_follow_up")),
      lost_reason: stage === "lost" ? str(formData.get("lost_reason")) : null,
      notes: str(formData.get("notes")),
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/");
  return { success: "Inquiry updated." };
}

export async function deleteInquiry(formData: FormData): Promise<void> {
  if (!(await requireUserId("pipeline.delete"))) return;
  const id = String(formData.get("id") ?? "");
  await prisma.inquiry.delete({ where: { id } });
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/** Move an inquiry to a different pipeline stage (used by the Kanban DnD). */
export async function moveInquiryStage(
  id: string,
  stage: InquiryStage,
): Promise<void> {
  if (!(await requireUserId("pipeline.manage"))) return;
  if (!INQUIRY_STAGES.has(stage)) return;

  const closed = stage === "won" || stage === "lost";
  await prisma.inquiry.update({
    where: { id },
    data: { stage, ...(closed && { next_follow_up: null }) },
  });

  revalidatePath("/pipeline");
  revalidatePath("/");
}

// Inquiry types map 1:1 to project types, except "other" which has no
// project equivalent and defaults to a website build.
const INQUIRY_TO_PROJECT_TYPE: Record<InquiryType, ProjectType> = {
  website: "website",
  web_app: "web_app",
  mobile_app: "mobile_app",
  ecommerce: "ecommerce",
  branding: "branding",
  maintenance: "maintenance",
  other: "website",
};

/**
 * Convert a won inquiry into a Project, carrying over the client, work type,
 * budget and notes. Marks the inquiry as won and opens the new project.
 */
export async function convertInquiryToProject(formData: FormData): Promise<void> {
  const userId = await requireUserId("projects.manage");
  if (!userId) return;
  const id = String(formData.get("id") ?? "");

  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) redirect("/pipeline");

  // An inquiry converts once. Re-running opens the project already created.
  const existing = await prisma.project.findFirst({
    where: { inquiry_id: id },
    select: { id: true },
  });
  if (existing) redirect(`/projects/${existing.id}`);

  const project = await prisma.project.create({
    data: {
      name: inquiry.title,
      type: INQUIRY_TO_PROJECT_TYPE[inquiry.type],
      company_id: inquiry.company_id,
      inquiry_id: inquiry.id,
      description: inquiry.notes,
      budget: inquiry.budget,
      phase: "discovery",
      status: "active",
      created_by: userId,
    },
  });

  await prisma.inquiry.update({
    where: { id },
    data: { stage: "won", next_follow_up: null },
  });

  revalidatePath("/pipeline");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

// -- helpers ------------------------------------------------------------------

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}
