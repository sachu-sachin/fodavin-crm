"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDriveUrl } from "@/lib/drive";
import { purgeDocumentFiles } from "@/lib/document-files";
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage";
import type { DocumentKind } from "@/lib/types";

export type DocumentState = { error?: string; success?: string };

const DOCUMENT_KIND = new Set<DocumentKind>([
  "proposal",
  "contract",
  "invoice",
  "design",
  "spec",
  "handover",
  "other",
]);

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function kindOf(v: FormDataEntryValue | null): DocumentKind {
  const k = String(v ?? "other").trim() as DocumentKind;
  return DOCUMENT_KIND.has(k) ? k : "other";
}

/** A document belongs to exactly one of a company or a project. */
function ownerFrom(formData: FormData) {
  const companyId = str(formData.get("company_id"));
  const projectId = str(formData.get("project_id"));
  if (!companyId && !projectId) return null;
  return { company_id: companyId, project_id: projectId };
}

function revalidateOwner(owner: {
  company_id: string | null;
  project_id: string | null;
}) {
  if (owner.company_id) revalidatePath(`/crm/${owner.company_id}`);
  if (owner.project_id) revalidatePath(`/projects/${owner.project_id}`);
}

/**
 * Object key for an upload. Prefixed by owner so the bucket stays browsable,
 * and given a random segment so two files with the same name never collide
 * (and so the key can't be guessed from the document name).
 */
function storageKey(
  owner: { company_id: string | null; project_id: string | null },
  fileName: string,
): string {
  const scope = owner.project_id
    ? `projects/${owner.project_id}`
    : `companies/${owner.company_id}`;
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
  return `${scope}/${crypto.randomUUID()}-${safe}`;
}

// -- Upload (Supabase Storage) ------------------------------------------------

export async function uploadDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const userId = await requireUserId("documents.upload");
  if (!userId) return { error: DENIED_MESSAGE };

  const owner = ownerFrom(formData);
  if (!owner) return { error: "Missing the client or project to attach to." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is larger than the 10MB limit." };
  }

  const name = str(formData.get("name")) ?? file.name;
  const key = storageKey(owner, file.name);

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(key, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    return {
      error: error.message.toLowerCase().includes("bucket")
        ? "The documents bucket is missing — run `npm run db:setup`."
        : error.message,
    };
  }

  try {
    await prisma.document.create({
      data: {
        name,
        source: "upload",
        kind: kindOf(formData.get("kind")),
        storage_path: key,
        mime_type: file.type || null,
        size_bytes: file.size,
        notes: str(formData.get("notes")),
        uploaded_by: userId,
        ...owner,
      },
    });
  } catch (e) {
    // Don't leave an orphaned object behind if the row fails to write.
    await admin.storage.from(DOCUMENTS_BUCKET).remove([key]);
    throw e;
  }

  revalidateOwner(owner);
  return { success: `${name} uploaded.` };
}

// -- Link (Google Drive or any URL) -------------------------------------------

export async function linkDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const userId = await requireUserId("documents.upload");
  if (!userId) return { error: DENIED_MESSAGE };

  const owner = ownerFrom(formData);
  if (!owner) return { error: "Missing the client or project to attach to." };

  const raw = str(formData.get("url"));
  if (!raw) return { error: "Paste a link." };

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(withScheme);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { error: "Only http and https links are supported." };
  }

  const drive = parseDriveUrl(withScheme);
  const name = str(formData.get("name")) ?? (drive ? "Google Drive file" : parsedUrl.hostname);

  await prisma.document.create({
    data: {
      name,
      source: drive ? "drive" : "link",
      kind: kindOf(formData.get("kind")),
      url: drive ? drive.url : withScheme,
      drive_file_id: drive?.fileId ?? null,
      notes: str(formData.get("notes")),
      uploaded_by: userId,
      ...owner,
    },
  });

  revalidateOwner(owner);
  return { success: `${name} linked.` };
}

// -- Delete -------------------------------------------------------------------

export async function deleteDocument(formData: FormData): Promise<void> {
  if (!(await requireUserId("documents.delete"))) return;
  const id = String(formData.get("id") ?? "");

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      source: true,
      storage_path: true,
      drive_file_id: true,
      company_id: true,
      project_id: true,
    },
  });
  if (!doc) return;

  // Remove the file first; a failure here would otherwise leave an object
  // nobody can reach or clean up.
  const purged = await purgeDocumentFiles([doc]);
  if (purged.failed > 0) return;

  await prisma.document.delete({ where: { id } });
  revalidateOwner(doc);
}
