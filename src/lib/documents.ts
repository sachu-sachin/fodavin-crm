import { parseDriveUrl } from "@/lib/drive";
import type { DocumentSource } from "@/lib/types";

// Presentation logic for documents, shared by the list and the add dialog.

export function formatSize(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export type FileGlyph =
  | "text"
  | "image"
  | "video"
  | "sheet"
  | "slides"
  | "link"
  | "generic";

/**
 * Pick an icon from the MIME type, falling back to the file extension.
 *
 * Native Google formats (Docs/Sheets/Slides) carry neither — they have no
 * extension and we store no MIME for linked files — so the Drive URL itself
 * is the only signal for those.
 */
export function fileGlyph(
  mimeType: string | null,
  name: string,
  source: DocumentSource,
  url?: string | null,
): FileGlyph {
  if (source === "link") return "link";

  if (url && (source === "drive" || source === "drive_upload")) {
    const drive = parseDriveUrl(url);
    if (drive) {
      if (drive.kind === "sheet") return "sheet";
      if (drive.kind === "slide") return "slides";
      if (drive.kind === "doc" || drive.kind === "form") return "text";
    }
  }

  const mime = mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") {
    return "sheet";
  }
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("word") || mime.includes("document")) {
    return "text";
  }

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (["xls", "xlsx", "csv", "numbers"].includes(ext)) return "sheet";
  if (["pdf", "doc", "docx", "txt", "md", "rtf"].includes(ext)) return "text";
  return "generic";
}

export interface SourceDescriptor {
  /** Short chip text. */
  label: string;
  chipClass: string;
  /** Whether deleting also destroys the underlying file. */
  ownedByApp: boolean;
  /** Plain-language consequence, shown in the delete confirmation. */
  deleteConsequence: string;
  confirmLabel: string;
}

/**
 * The critical distinction: `drive_upload` files were put in Drive BY this
 * app, so removing the document deletes the real file. A `drive` document is
 * only a pointer at someone else's file and deleting it removes nothing.
 *
 * Both used to render as a generic "Drive" chip, which meant the Delete
 * button had two very different consequences and no way to tell them apart.
 */
export function describeSource(source: DocumentSource): SourceDescriptor {
  switch (source) {
    case "upload":
      return {
        label: "Stored file",
        chipClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
        ownedByApp: true,
        deleteConsequence:
          "This permanently deletes the stored file. It cannot be undone.",
        confirmLabel: "Delete file",
      };
    case "drive_upload":
      return {
        label: "In Drive",
        chipClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        ownedByApp: true,
        deleteConsequence:
          "This permanently deletes the file from your Google Drive. It cannot be undone.",
        confirmLabel: "Delete from Drive",
      };
    case "drive":
      return {
        label: "Drive link",
        chipClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        ownedByApp: false,
        deleteConsequence:
          "This removes the link only. The file stays in Google Drive, untouched.",
        confirmLabel: "Remove link",
      };
    case "link":
      return {
        label: "Link",
        chipClass: "bg-muted text-muted-foreground",
        ownedByApp: false,
        deleteConsequence:
          "This removes the link only. Nothing at the destination is changed.",
        confirmLabel: "Remove link",
      };
  }
}
