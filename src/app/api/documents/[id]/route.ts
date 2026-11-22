import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";

/** How long an issued download link stays valid. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Resolves a document to something the browser can open.
 *
 * Uploads live in a private bucket, so we mint a short-lived signed URL per
 * request rather than storing a public link — a leaked href expires in a
 * minute, and access is re-checked against the session every time.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.redirect(new URL("/login", _request.nextUrl));
  }
  // Signed in isn't enough: opening files needs the documents permission,
  // the same as seeing them listed.
  if (!can(session, "documents.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { name: true, url: true, storage_path: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // External links (Drive and friends) are just a redirect — we never
  // proxy them, so Google's own sharing rules still apply.
  if (doc.url) return NextResponse.redirect(doc.url);

  if (!doc.storage_path) {
    return NextResponse.json({ error: "Document has no file" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, {
      // The download filename goes into a header: non-ASCII characters
      // (a "–", a Tamil name) make signing fail, so swap them out.
      download: doc.name.replace(/[^ -~]/g, "_"),
    });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not sign the file" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
