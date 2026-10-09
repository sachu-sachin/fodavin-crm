import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_HEADER } from "@/lib/supabase/verified-user-header";

/**
 * Refreshes the Supabase auth session on every request and guards routes.
 * Unauthenticated users are redirected to /login (except public routes).
 */
export async function updateSession(request: NextRequest) {
  // Strip unconditionally, before anything else, so a request forged with
  // this header can never ride through to a Server Component below — it is
  // only ever (re-)added further down, after getUser() has verified the
  // id server-side. Everything after this point reads/writes requestHeaders,
  // never request.headers directly.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(VERIFIED_USER_HEADER);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // /api/cron/* is called by a scheduler, not a signed-in person; each of
  // those routes checks its own CRON_SECRET instead (see src/lib/cron.ts).
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/cron/");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // getUser() above already paid for one real network round trip to
  // Supabase's auth server to verify this id; forward it so
  // getSessionProfile() (layout + every page, same request) can skip
  // paying for a second, identical one. Cookies already staged on
  // supabaseResponse by setAll (e.g. a refreshed token) are preserved.
  if (user) {
    requestHeaders.set(VERIFIED_USER_HEADER, user.id);
    const finalResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie);
    });
    supabaseResponse = finalResponse;
  }

  return supabaseResponse;
}
