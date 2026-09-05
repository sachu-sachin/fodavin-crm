import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";

/** The fields needed to work out what a document owns on disk. */
export interface PurgeableDocument {
  source: string;
  storage_path: string | null;
  drive_file_id: string | null;
}

export interface PurgeResult {
  storageRemoved: number;
  driveRemoved: number;
  failed: number;
}

/**
 * Delete the *files* behind a set of documents.
 *
 * This exists because Postgres cascades only delete rows. When a project or
 * company is removed, its `documents` rows vanish via the FK cascade and the
 * underlying objects would be stranded — invisible in the app, still costing
 * Drive and bucket quota, and impossible to find later. Callers must run this
 * before the cascade fires.
 *
 * Only files this app created are touched: a `drive` document points at a
 * file that already existed in someone's Drive, and deleting our record must
 * never destroy the client's original.
 */
export async function purgeDocumentFiles(
  documents: PurgeableDocument[],
): Promise<PurgeResult> {
  const result: PurgeResult = {
    storageRemoved: 0,
    driveRemoved: 0,
    failed: 0,
  };
  if (documents.length === 0) return result;

  const storagePaths = documents
    .filter((d) => d.source === "upload" && d.storage_path)
    .map((d) => d.storage_path as string);

  if (storagePaths.length > 0) {
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .remove(storagePaths);
    if (error) result.failed += storagePaths.length;
    else result.storageRemoved += storagePaths.length;
  }

  const driveIds = documents
    .filter((d) => d.source === "drive_upload" && d.drive_file_id)
    .map((d) => d.drive_file_id as string);

  if (driveIds.length > 0) {
    const { deleteDriveFile } = await import("@/lib/google/drive");
    for (const fileId of driveIds) {
      const ok = await deleteDriveFile(fileId).catch(() => false);
      if (ok) result.driveRemoved += 1;
      else result.failed += 1;
    }
  }

  return result;
}
