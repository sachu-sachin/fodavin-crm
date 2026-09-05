import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionProfile } from "@/lib/auth";
import { encryptSecret, safeEqual } from "@/lib/crypto";
import { OAUTH_STATE_COOKIE } from "@/lib/google/config";
import {
  clearTokenCache,
  createAppFolder,
  exchangeCode,
  fetchAccountEmail,
} from "@/lib/google/drive";

const FOLDER_NAME = "Fodavin CRM Documents";

function back(request: NextRequest, status: string) {
  return NextResponse.redirect(
    new URL(`/settings?google=${status}`, request.nextUrl),
  );
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (!session.isAdmin) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  const params = request.nextUrl.searchParams;

  // The state cookie is single-use whatever happens next.
  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  if (params.get("error")) return back(request, "denied");

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !expectedState || !safeEqual(state, expectedState)) {
    return back(request, "bad_state");
  }
  if (!code) return back(request, "no_code");

  try {
    const { refreshToken, accessToken, scope } = await exchangeCode(code);

    // Without a refresh token we can't act after the first hour. This
    // happens when the account was already authorised and Google skipped
    // re-consent — the fix is to revoke and connect again.
    if (!refreshToken) return back(request, "no_refresh_token");

    // Refuse to store a token that didn't come with the write scope, rather
    // than failing confusingly at the first upload.
    if (!scope.includes("drive.file")) return back(request, "missing_scope");

    const email = await fetchAccountEmail(accessToken);
    const folder = await createAppFolder(accessToken, FOLDER_NAME);

    const encrypted = encryptSecret(refreshToken);

    await prisma.googleAccount.upsert({
      where: { singleton: true },
      create: {
        singleton: true,
        email,
        refresh_token_encrypted: encrypted,
        folder_id: folder.id,
        folder_name: folder.name,
        granted_scopes: scope,
        connected_by: session.userId,
      },
      update: {
        email,
        refresh_token_encrypted: encrypted,
        folder_id: folder.id,
        folder_name: folder.name,
        granted_scopes: scope,
        connected_by: session.userId,
        updated_at: new Date(),
      },
    });

    clearTokenCache();
    return back(request, "connected");
  } catch (err) {
    // Log the class of failure, never the payload — it can carry token data.
    console.error(
      "Google OAuth callback failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return back(request, "failed");
  }
}

export const dynamic = "force-dynamic";
