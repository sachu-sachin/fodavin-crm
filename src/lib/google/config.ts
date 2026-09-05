import "server-only";

/**
 * Google OAuth configuration.
 *
 * SCOPE CHOICE — this is the most important security decision here.
 * `drive.file` grants access *only to files this app itself creates or that
 * a user explicitly opens with it*. It cannot read, list, or touch anything
 * else in the connected Drive.
 *
 * That matters twice over:
 *  1. Least privilege — a compromise of our stored token exposes only the
 *     documents this CRM uploaded, never the agency's whole Drive.
 *  2. Google classifies `drive.file` as non-sensitive, so the app avoids the
 *     restricted-scope security assessment (CASA) that `drive` or
 *     `drive.readonly` would trigger — which is a paid annual audit.
 *
 * Do NOT widen this to `https://www.googleapis.com/auth/drive`.
 */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API =
  "https://www.googleapis.com/upload/drive/v3/files";

/** Files at or below this go to Supabase Storage; above it, Google Drive. */
export const SUPABASE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
/** Practical ceiling for a browser-side resumable upload. */
export const DRIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export const OAUTH_STATE_COOKIE = "g_oauth_state";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * The redirect URI must match an entry in the Cloud Console *exactly*.
 * We derive it from an explicit env var rather than the request host, so a
 * spoofed Host header can never redirect an OAuth code somewhere else.
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/google/callback`,
  };
}

export function isGoogleConfigured(): boolean {
  return googleConfig() !== null;
}
