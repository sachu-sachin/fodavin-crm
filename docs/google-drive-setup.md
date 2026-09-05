# Google Drive setup

Large files (over 10MB) upload **directly from the browser to Google Drive**.
Smaller files stay in the private Supabase Storage bucket. This document covers
creating the Google credentials and the security model behind the choices.

---

## Part 1 — Google Cloud Console

### 1. Enable the Drive API

1. Open [console.cloud.google.com](https://console.cloud.google.com) and select
   your project (top-left picker).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

### 2. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

Pick the user type carefully — this is the single most consequential choice:

| Your Google setup | Choose | Consequence |
|---|---|---|
| Google Workspace (custom domain) | **Internal** | No verification, no test-user limit, refresh tokens never expire on a schedule. Strongly preferred. |
| Free Gmail account | **External** | You must add test users, and while in *Testing* mode **refresh tokens expire after 7 days**. |

> **The 7-day trap.** On an External app left in *Testing*, Drive silently stops
> working a week after you connect it. If you're on External, click
> **Publish app** to move it to *Production*. Because we only request the
> `drive.file` scope (non-sensitive), publishing does **not** require Google's
> restricted-scope security assessment.

Fill in the app name, your support email, and a developer contact email.

### 3. Add the scope

**Add or remove scopes** → add exactly one:

```
https://www.googleapis.com/auth/drive.file
```

Do **not** add `.../auth/drive` or `.../auth/drive.readonly`. Those are
*restricted* scopes: they grant access to the entire Drive and trigger a paid
annual CASA security assessment. `drive.file` limits this app to files it
created itself — see the security matrix below.

### 4. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- **Application type:** Web application
- **Name:** Fodavin CRM
- **Authorised redirect URIs** — add one line per environment, matching
  `APP_URL` exactly (scheme, host, port, no trailing slash):

```
http://localhost:3000/api/google/callback
https://your-production-domain.com/api/google/callback
```

Copy the **Client ID** and **Client secret**.

### 5. Choose which Google account to connect

Whoever completes the consent screen becomes the owner of every uploaded file.
Use a **shared agency account** (e.g. `docs@fodavin.com`), not a personal one —
otherwise the files leave with the person.

---

## Part 2 — Environment variables

Generate the encryption key:

```bash
openssl rand -base64 32
```

Add to `.env.local` (and to Vercel → Settings → Environment Variables):

```
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_TOKEN_ENC_KEY=the-base64-key-you-just-generated
```

In production set `APP_URL` to the real origin. All four are **server-only** —
none carry the `NEXT_PUBLIC_` prefix, so none reach the browser.

Restart the server, then go to **Settings → Google Drive → Connect**.
Only an admin sees this page.

---

## Security matrix

| Control | Implementation | Why |
|---|---|---|
| **Least-privilege scope** | `drive.file` only | The app can only touch files it created. A stolen token cannot read the agency's wider Drive, and it avoids the restricted-scope CASA audit. |
| **Token at rest** | AES-256-GCM, versioned `v1.iv.tag.ciphertext` ([crypto.ts](../src/lib/crypto.ts)) | Confidentiality *and* integrity. A tampered ciphertext fails closed instead of decrypting to garbage. |
| **Key separation** | `GOOGLE_TOKEN_ENC_KEY` lives in env, ciphertext in Postgres | A database dump alone is not enough to recover the token. |
| **Token never client-side** | Browser receives only a resumable session URI | The access token never leaves the server. The URI is a single-file, short-lived write capability. |
| **Large files bypass the server** | Browser `PUT`s straight to Google | No 2GB buffer in a serverless function, no Vercel body limit, and the file never lands on our infrastructure. |
| **CSRF on OAuth** | 32-byte random `state` in an httpOnly, SameSite=Lax cookie, compared with `timingSafeEqual` | A forged callback can't complete a connection. |
| **Fixed redirect URI** | Derived from `APP_URL`, never the request `Host` header | A spoofed Host cannot redirect an authorisation code elsewhere. |
| **Admin-only connect** | `requireAdmin` on `/settings`, `/api/google/connect`, `/api/google/callback`, and `disconnectGoogle` | Binding the agency's Drive is not an individual employee's decision. Verified: a non-admin hitting the connect URL is redirected without ever reaching Google. |
| **Scope verification** | Callback rejects a grant that lacks `drive.file` | Fails at connect time with a clear message, not at the first upload. |
| **Server-side metadata** | Size, MIME and link re-read from Drive after upload | The client can't lie about what it uploaded. |
| **Deletion safety** | Only `drive_upload` documents are deleted from Drive; `drive` links never are | Removing a linked file from the CRM must never destroy a client's original. |
| **Real revocation** | Disconnect calls Google's revoke endpoint before dropping the row | Disconnecting actually invalidates the grant rather than just forgetting it. |
| **No secret logging** | Google error bodies are never echoed; only a message class is logged | Token material can appear in provider error payloads. |
| **Supabase bucket private** | `public = false`, 60-second signed URLs | Verified: the public URL and a direct anon-key request both return 400. |

### Key rotation

Rotating `GOOGLE_TOKEN_ENC_KEY` makes the stored token undecryptable — this is
intentional. To rotate: set the new key, restart, then **Settings → Reconnect**.
If the client secret is ever exposed, reset it in the Cloud Console and
reconnect; also revoke the app at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `redirect_uri_mismatch` | The Console URI doesn't match `<APP_URL>/api/google/callback` byte for byte. Check http vs https, port, trailing slash. |
| "Google didn't issue a refresh token" | The account already authorised this app, so Google skipped consent. Remove it at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), then reconnect. |
| Drive stops working after ~7 days | External app still in *Testing*. Publish it to *Production*. |
| "Google rejected the stored credentials" | The token was revoked or the encryption key changed. Reconnect under Settings. |
| Uploads fail at ~10MB with Drive connected | The bucket path is being used. Confirm `GOOGLE_CLIENT_ID` is set and the server was restarted. |
