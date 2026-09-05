"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";
import { DRIVE_MAX_BYTES, SUPABASE_MAX_BYTES } from "@/lib/google/config";
import {
  clearTokenCache,
  createResumableSession,
  getConnectedAccount,
  getFileMeta,
  revokeToken,
} from "@/lib/google/drive";
import type { DocumentKind } from "@/lib/types";

export type DriveState = { error?: string; success?: string };

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

/** Disconnect Drive: revoke at Google, then forget the token locally. */
export async function disconnectGoogle(): Promise<void> {
  if (!(await requireUserId("settings.manage"))) return;

  const account = await getConnectedAccount();
  if (!account) return;

  try {
    await revokeToken(decryptSecret(account.refresh_token_encrypted));
  } catch {
    // A token we can't decrypt is already useless to us; drop it anyway.
  }

  await prisma.googleAccount.deleteMany({ where: { singleton: true } });
  clearTokenCache();
  revalidatePath("/settings");
}

/**
 * Step 1 of a direct-to-Drive upload: mint a resumable session.
 *
 * The browser gets back only the session URI — never an access token — and
 * PUTs the bytes straight to Google. Nothing large transits this server.
 */
export async function startDriveUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  companyId?: string;
  projectId?: string;
}): Promise<{ uploadUrl?: string; error?: string }> {
  if (!(await requireUserId("documents.upload"))) return { error: DENIED_MESSAGE };

  if (!input.companyId && !input.projectId) {
    return { error: "Missing the client or project to attach to." };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { error: "That file looks empty." };
  }
  if (input.sizeBytes > DRIVE_MAX_BYTES) {
    return { error: "That file is larger than the 2GB limit." };
  }

  const account = await getConnectedAccount();
  if (!account) {
    return {
      error:
        "Google Drive isn't connected. An admin can connect it under Settings.",
    };
  }

  const name = input.fileName.trim().slice(0, 200) || "Untitled";

  try {
    const uploadUrl = await createResumableSession({
      name,
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.sizeBytes,
      folderId: account.folder_id,
    });
    return { uploadUrl };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not start the upload.",
    };
  }
}

/**
 * Step 2: the browser finished the PUT and hands us the Drive file id.
 *
 * We re-read the file's metadata from Drive rather than trusting the size or
 * link the client reports, then record the document.
 */
export async function finishDriveUpload(input: {
  fileId: string;
  name: string;
  kind: string;
  notes?: string;
  companyId?: string;
  projectId?: string;
}): Promise<DriveState> {
  const userId = await requireUserId("documents.upload");
  if (!userId) return { error: DENIED_MESSAGE };

  if (!input.companyId && !input.projectId) {
    return { error: "Missing the client or project to attach to." };
  }
  if (!/^[\w-]{10,}$/.test(input.fileId)) {
    return { error: "Google returned an unexpected file id." };
  }

  let meta;
  try {
    meta = await getFileMeta(input.fileId);
  } catch {
    return { error: "Uploaded, but Drive wouldn't confirm the file." };
  }

  const kind = DOCUMENT_KIND.has(input.kind as DocumentKind)
    ? (input.kind as DocumentKind)
    : "other";

  const name = input.name.trim() || meta.name;

  await prisma.document.create({
    data: {
      name,
      source: "drive_upload",
      kind,
      url: meta.webViewLink,
      drive_file_id: meta.id,
      mime_type: meta.mimeType,
      size_bytes: meta.size,
      notes: input.notes?.trim() || null,
      uploaded_by: userId,
      company_id: input.companyId ?? null,
      project_id: input.projectId ?? null,
    },
  });

  if (input.companyId) revalidatePath(`/crm/${input.companyId}`);
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
  return { success: `${name} uploaded to Drive.` };
}

/** Surface for the UI: is Drive available, and what's the size threshold? */
export async function getDriveStatus(): Promise<{
  connected: boolean;
  email: string | null;
  folderName: string | null;
  supabaseMaxBytes: number;
}> {
  const allowed = await requireUserId("documents.view");
  const account = allowed ? await getConnectedAccount() : null;
  return {
    connected: !!account,
    email: account?.email ?? null,
    folderName: account?.folder_name ?? null,
    supabaseMaxBytes: SUPABASE_MAX_BYTES,
  };
}
