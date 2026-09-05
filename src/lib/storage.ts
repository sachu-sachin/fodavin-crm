// Storage constants shared by the document Server Actions and the download
// route. These deliberately live outside `actions/documents.ts`: a
// "use server" module may only export async functions, so exporting plain
// constants from there breaks the whole module at build time.

export const DOCUMENTS_BUCKET = "documents";

/** Matches the bucket's own file_size_limit in supabase/setup.sql. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
