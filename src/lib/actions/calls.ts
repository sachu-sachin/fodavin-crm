"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorize, can, DENIED_MESSAGE } from "@/lib/auth";
import { parseISTInput } from "@/lib/format";
import { isCallDirection, isCallOutcome, stageAfterCall } from "@/lib/calls";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { purgeDocumentFiles } from "@/lib/document-files";
import {
  createResumableSession,
  getConnectedAccount,
  getFileMeta,
} from "@/lib/google/drive";

export type CallState = { error?: string; success?: string; callId?: string };

const DRIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

function dateOnly(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}

function revalidateLead(inquiryId: string, companyId: string | null) {
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${inquiryId}`);
  revalidatePath("/");
  if (companyId) revalidatePath(`/crm/${companyId}`);
}

/**
 * Log a call against a lead. The lead moves forward when the call says so
 * (picked up → contacted, interested, call back → follow up, not interested
 * → closed) and its next follow-up becomes the call's, when one is given.
 */
export async function logCall(_prev: CallState, formData: FormData): Promise<CallState> {
  const session = await authorize("pipeline.manage");
  if (!session) return { error: DENIED_MESSAGE };

  const inquiryId = String(formData.get("inquiry_id") ?? "");
  const direction = String(formData.get("direction") ?? "outgoing");
  const outcome = String(formData.get("outcome") ?? "");
  const calledAt = parseISTInput(String(formData.get("called_at") ?? "")) ?? new Date();
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const duration = durationRaw ? Number(durationRaw) : null;

  if (!isCallDirection(direction)) return { error: "Pick incoming or outgoing." };
  if (!isCallOutcome(outcome)) return { error: "Pick how the call went." };
  if (duration != null && (!Number.isInteger(duration) || duration < 0 || duration > 600)) {
    return { error: "Duration must be whole minutes (0–600)." };
  }
  if (calledAt.getTime() > Date.now() + 5 * 60_000) {
    return { error: "The call time is in the future." };
  }

  const lead = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true, stage: true, company_id: true },
  });
  if (!lead) return { error: "That lead no longer exists." };

  const nextFollowUp = dateOnly(formData.get("next_follow_up"));
  const newStage = stageAfterCall(lead.stage, outcome);
  const closed = newStage === "not_interested";

  const [call] = await prisma.$transaction([
    prisma.callLog.create({
      data: {
        inquiry_id: lead.id,
        company_id: lead.company_id,
        direction,
        outcome,
        called_at: calledAt,
        duration_minutes: duration,
        notes: str(formData.get("notes")),
        next_follow_up: nextFollowUp,
        logged_by: session.userId,
      },
      select: { id: true },
    }),
    prisma.inquiry.update({
      where: { id: lead.id },
      data: {
        ...(newStage ? { stage: newStage } : {}),
        ...(closed ? { next_follow_up: null } : nextFollowUp ? { next_follow_up: nextFollowUp } : {}),
      },
    }),
  ]);

  revalidateLead(lead.id, lead.company_id);
  return { success: "Call logged.", callId: call.id };
}

/** Delete a logged call and its recordings (files included). */
export async function deleteCall(formData: FormData): Promise<void> {
  if (!(await authorize("pipeline.delete"))) return;
  const id = String(formData.get("id") ?? "");
  const call = await prisma.callLog.findUnique({
    where: { id },
    select: {
      inquiry_id: true,
      company_id: true,
      recordings: { select: { id: true, source: true, storage_path: true, drive_file_id: true } },
    },
  });
  if (!call) return;
  await purgeDocumentFiles(call.recordings);
  await prisma.$transaction([
    prisma.document.deleteMany({ where: { call_id: id } }),
    prisma.callLog.delete({ where: { id } }),
  ]);
  if (call.inquiry_id) revalidateLead(call.inquiry_id, call.company_id);
}

// -- Recordings -------------------------------------------------------------------

async function recordingOwner(callId: string) {
  const session = await authorize("pipeline.manage");
  if (!session || !can(session, "documents.upload")) return { error: DENIED_MESSAGE } as const;
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    select: { id: true, inquiry_id: true, company_id: true, called_at: true },
  });
  if (!call) return { error: "That call no longer exists." } as const;
  return { session, call } as const;
}

const recordingName = (calledAt: Date, fileName: string) =>
  `Call recording ${calledAt.toISOString().slice(0, 10)} - ${fileName}`.slice(0, 200);

/** Small recordings (up to the storage limit) go to the private bucket. */
export async function uploadCallRecording(
  _prev: CallState,
  formData: FormData,
): Promise<CallState> {
  const callId = String(formData.get("call_id") ?? "");
  const owner = await recordingOwner(callId);
  if ("error" in owner) return { error: owner.error };
  const { session, call } = owner;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the recording file." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is over 10 MB: it needs Google Drive (connect it under Settings)." };
  }
  if (file.type && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
    return { error: "That doesn't look like an audio recording." };
  }

  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `calls/${call.id}/${crypto.randomUUID()}-${safe}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(key, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: error.message };

  try {
    await prisma.document.create({
      data: {
        name: recordingName(call.called_at, file.name),
        source: "upload",
        kind: "other",
        storage_path: key,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: session.userId,
        company_id: call.company_id,
        call_id: call.id,
      },
    });
  } catch (e) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([key]);
    throw e;
  }
  if (call.inquiry_id) revalidateLead(call.inquiry_id, call.company_id);
  return { success: "Recording uploaded." };
}

/** Large recordings: step 1 of a direct-to-Drive upload. */
export async function startRecordingUpload(input: {
  callId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadUrl?: string; error?: string }> {
  const owner = await recordingOwner(input.callId);
  if ("error" in owner) return { error: owner.error };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { error: "That file looks empty." };
  if (input.sizeBytes > DRIVE_MAX_BYTES) return { error: "That file is larger than the 2 GB limit." };

  const account = await getConnectedAccount();
  if (!account) {
    return { error: "Google Drive isn't connected. An admin can connect it under Settings." };
  }
  try {
    const uploadUrl = await createResumableSession({
      name: recordingName(owner.call.called_at, input.fileName),
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.sizeBytes,
      folderId: account.folder_id,
    });
    return { uploadUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the upload." };
  }
}

/** Step 2: record the uploaded Drive file against the call. */
export async function finishRecordingUpload(input: {
  callId: string;
  fileId: string;
}): Promise<CallState> {
  const owner = await recordingOwner(input.callId);
  if ("error" in owner) return { error: owner.error };
  if (!/^[\w-]{10,}$/.test(input.fileId)) return { error: "Google returned an unexpected file id." };

  let meta;
  try {
    meta = await getFileMeta(input.fileId);
  } catch {
    return { error: "Uploaded, but Drive wouldn't confirm the file." };
  }
  const { session, call } = owner;
  await prisma.document.create({
    data: {
      name: meta.name,
      source: "drive_upload",
      kind: "other",
      url: meta.webViewLink,
      drive_file_id: meta.id,
      mime_type: meta.mimeType,
      size_bytes: meta.size,
      uploaded_by: session.userId,
      company_id: call.company_id,
      call_id: call.id,
    },
  });
  if (call.inquiry_id) revalidateLead(call.inquiry_id, call.company_id);
  return { success: "Recording uploaded to Drive." };
}
