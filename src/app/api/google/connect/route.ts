import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { hasEncryptionKey } from "@/lib/crypto";
import {
  DRIVE_SCOPES,
  GOOGLE_AUTH_URL,
  OAUTH_STATE_COOKIE,
  googleConfig,
} from "@/lib/google/config";

/**
 * Starts the Google OAuth consent flow. Admin-only: connecting Drive binds
 * the whole agency's uploads to one Google account, so it isn't a decision
 * an individual employee gets to make.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (!session.isAdmin) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  const config = googleConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/settings?google=not_configured", request.nextUrl),
    );
  }
  if (!hasEncryptionKey()) {
    return NextResponse.redirect(
      new URL("/settings?google=no_key", request.nextUrl),
    );
  }

  // CSRF: a random state echoed back by Google and compared against an
  // httpOnly cookie, so a forged callback can't complete the connection.
  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // offline + consent is what actually returns a refresh token; without
  // prompt=consent Google omits it on repeat authorisations.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  return NextResponse.redirect(url);
}
