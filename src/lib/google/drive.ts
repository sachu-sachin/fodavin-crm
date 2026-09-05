import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  googleConfig,
} from "@/lib/google/config";

/**
 * Access tokens last an hour. Cache in module memory so a burst of uploads
 * doesn't hammer Google's token endpoint. This is per-instance and dies with
 * the process — deliberately not persisted, since the refresh token in the
 * database is the only durable secret.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export class DriveNotConnectedError extends Error {
  constructor() {
    super("Google Drive is not connected.");
    this.name = "DriveNotConnectedError";
  }
}

export async function getConnectedAccount() {
  return prisma.googleAccount.findFirst({ where: { singleton: true } });
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const config = googleConfig();
  if (!config) throw new DriveNotConnectedError();

  const account = await getConnectedAccount();
  if (!account) throw new DriveNotConnectedError();

  const refreshToken = decryptSecret(account.refresh_token_encrypted);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Never surface Google's body — it can echo token material.
    throw new Error(
      res.status === 400 || res.status === 401
        ? "Google rejected the stored credentials. Reconnect Drive in Settings."
        : `Google token endpoint returned ${res.status}.`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/** Drop the cached token — call after disconnecting. */
export function clearTokenCache() {
  cachedToken = null;
}

/** Trade an authorization code for tokens during the OAuth callback. */
export async function exchangeCode(code: string): Promise<{
  refreshToken: string | null;
  accessToken: string;
  scope: string;
}> {
  const config = googleConfig();
  if (!config) throw new DriveNotConnectedError();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`Code exchange failed (${res.status}).`);

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
  };

  return {
    refreshToken: data.refresh_token ?? null,
    accessToken: data.access_token,
    scope: data.scope,
  };
}

export async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error("Could not read the Google account email.");
  const data = (await res.json()) as { email?: string };
  return data.email ?? "unknown";
}

/** Revoke the refresh token at Google, so disconnecting is a real revocation. */
export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {
    // Best effort: we still drop our copy even if Google is unreachable.
  });
}

/**
 * Create the folder all uploads are filed under.
 * With `drive.file` we can only see folders we created, so this is called
 * once at connect time and the id is stored.
 */
export async function createAppFolder(
  accessToken: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) throw new Error(`Could not create the Drive folder (${res.status}).`);
  return (await res.json()) as { id: string; name: string };
}

/**
 * Open a resumable upload session and hand back its URI.
 *
 * SECURITY: this URI is the only thing the browser receives. It is a
 * short-lived, single-file capability — it carries no access token, grants
 * nothing beyond writing this one file, and cannot be used to read Drive.
 * The file bytes go browser → Google directly, so large uploads never pass
 * through (or get buffered by) our server.
 */
export async function createResumableSession(params: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
}): Promise<string> {
  const accessToken = await getAccessToken();

  const metadata: Record<string, unknown> = { name: params.name };
  if (params.folderId) metadata.parents = [params.folderId];

  const res = await fetch(
    `${DRIVE_UPLOAD_API}?uploadType=resumable&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": params.mimeType,
        "X-Upload-Content-Length": String(params.sizeBytes),
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!res.ok) {
    throw new Error(`Drive refused the upload session (${res.status}).`);
  }

  const location = res.headers.get("location");
  if (!location) throw new Error("Drive did not return an upload URL.");
  return location;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  webViewLink: string | null;
  mimeType: string | null;
  size: number | null;
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,webViewLink,mimeType,size&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Could not read the uploaded file (${res.status}).`);

  const data = (await res.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
    mimeType?: string;
    size?: string;
  };

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink ?? null,
    mimeType: data.mimeType ?? null,
    size: data.size ? Number(data.size) : null,
  };
}

/** Only ever called for files this app uploaded (source = drive_upload). */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 404 means it's already gone, which satisfies the caller's intent.
  return res.ok || res.status === 404;
}
