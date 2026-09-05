// Google Drive / Workspace link handling.
//
// We deliberately do NOT talk to the Drive API: no OAuth, no service account,
// no stored tokens. A Drive document is just a URL we recognise, so access
// stays governed by Google's own sharing settings — if a teammate can't open
// the link in Drive, linking it here doesn't grant them anything.

export type DriveKind =
  | "doc"
  | "sheet"
  | "slide"
  | "form"
  | "file"
  | "folder";

export interface DriveLink {
  fileId: string;
  kind: DriveKind;
  /** Normalised, shareable URL for the file. */
  url: string;
  /** Direct-view URL suitable for an <iframe>, when Google offers one. */
  previewUrl: string | null;
}

const DRIVE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "sheets.google.com",
  "slides.google.com",
  "forms.google.com",
]);

const EDITOR_KIND: Record<string, DriveKind> = {
  document: "doc",
  spreadsheets: "sheet",
  presentation: "slide",
  forms: "form",
};

const KIND_LABEL: Record<DriveKind, string> = {
  doc: "Google Doc",
  sheet: "Google Sheet",
  slide: "Google Slides",
  form: "Google Form",
  file: "Drive file",
  folder: "Drive folder",
};

export function driveKindLabel(kind: DriveKind | null): string {
  return kind ? KIND_LABEL[kind] : "Link";
}

/** True when the URL points at Google Drive / Docs / Sheets / Slides. */
export function isDriveUrl(raw: string): boolean {
  return parseDriveUrl(raw) !== null;
}

/**
 * Pull the file id out of any of the shapes Google hands out:
 *   docs.google.com/document/d/{id}/edit
 *   drive.google.com/file/d/{id}/view?usp=sharing
 *   drive.google.com/open?id={id}
 *   drive.google.com/drive/folders/{id}
 *   docs.google.com/spreadsheets/d/e/{publishedId}/pubhtml
 * Returns null for anything we don't confidently recognise, so the caller can
 * fall back to storing it as a plain link.
 */
export function parseDriveUrl(raw: string): DriveLink | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (!DRIVE_HOSTS.has(host)) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);

  // /open?id={id} and /uc?id={id}
  const queryId = parsed.searchParams.get("id");
  if (queryId && /^[\w-]{10,}$/.test(queryId)) {
    return build(queryId, "file");
  }

  // /drive/folders/{id}
  const folderIdx = segments.indexOf("folders");
  if (folderIdx !== -1 && segments[folderIdx + 1]) {
    return build(segments[folderIdx + 1], "folder");
  }

  // Everything else is ".../d/{id}/..." — note the published variant
  // ".../d/e/{id}/pubhtml", where the real id sits one segment further on.
  const dIdx = segments.indexOf("d");
  if (dIdx === -1) return null;
  const candidate =
    segments[dIdx + 1] === "e" ? segments[dIdx + 2] : segments[dIdx + 1];
  if (!candidate || !/^[\w-]{10,}$/.test(candidate)) return null;

  const kind = EDITOR_KIND[segments[0]] ?? "file";
  return build(candidate, kind);
}

function build(fileId: string, kind: DriveKind): DriveLink {
  switch (kind) {
    case "doc":
      return {
        fileId,
        kind,
        url: `https://docs.google.com/document/d/${fileId}/edit`,
        previewUrl: `https://docs.google.com/document/d/${fileId}/preview`,
      };
    case "sheet":
      return {
        fileId,
        kind,
        url: `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
        previewUrl: `https://docs.google.com/spreadsheets/d/${fileId}/preview`,
      };
    case "slide":
      return {
        fileId,
        kind,
        url: `https://docs.google.com/presentation/d/${fileId}/edit`,
        previewUrl: `https://docs.google.com/presentation/d/${fileId}/preview`,
      };
    case "form":
      return {
        fileId,
        kind,
        url: `https://docs.google.com/forms/d/${fileId}/edit`,
        previewUrl: null,
      };
    case "folder":
      return {
        fileId,
        kind,
        url: `https://drive.google.com/drive/folders/${fileId}`,
        previewUrl: null,
      };
    default:
      return {
        fileId,
        kind: "file",
        url: `https://drive.google.com/file/d/${fileId}/view`,
        previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      };
  }
}
