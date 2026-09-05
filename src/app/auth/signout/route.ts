import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears the Supabase session and lands on /login.
 *
 * Server Components can't write cookies, so a deactivated employee detected
 * during a page render is redirected here to actually be signed out. Without
 * that, the stale session cookie survives and the proxy bounces /login back
 * to / forever.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const reason = request.nextUrl.searchParams.get("reason");
  url.search = reason ? `?reason=${encodeURIComponent(reason)}` : "";

  return NextResponse.redirect(url);
}
