"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CloudIcon, ExternalLinkIcon, FolderIcon } from "lucide-react";
import { disconnectGoogle } from "@/lib/actions/google";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NOTICES: Record<string, { text: string; tone: "ok" | "bad" }> = {
  connected: { text: "Google Drive connected.", tone: "ok" },
  denied: { text: "You declined the Google consent screen.", tone: "bad" },
  bad_state: {
    text: "The sign-in didn't match the request that started it. Try again.",
    tone: "bad",
  },
  no_code: { text: "Google didn't return an authorisation code.", tone: "bad" },
  no_refresh_token: {
    text:
      "Google didn't issue a refresh token. Remove this app at myaccount.google.com/permissions, then connect again.",
    tone: "bad",
  },
  missing_scope: {
    text: "The Drive permission wasn't granted. Connect again and allow it.",
    tone: "bad",
  },
  not_configured: {
    text: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL aren't set.",
    tone: "bad",
  },
  no_key: {
    text: "GOOGLE_TOKEN_ENC_KEY isn't set, so the token can't be stored safely.",
    tone: "bad",
  },
  failed: { text: "Connecting failed. Check the server logs.", tone: "bad" },
};

export function GoogleDriveCard({
  connected,
  email,
  folderName,
  folderId,
  configured,
  notice,
  supabaseMaxLabel,
}: {
  connected: boolean;
  email: string | null;
  folderName: string | null;
  folderId: string | null;
  configured: boolean;
  notice?: string;
  supabaseMaxLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const message = notice ? NOTICES[notice] : undefined;

  function onDisconnect() {
    startTransition(async () => {
      await disconnectGoogle();
      toast.success("Google Drive disconnected and the token revoked.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Google Drive</CardTitle>
        {connected ? (
          <Badge variant="secondary">Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {message && (
          <p
            className={
              message.tone === "ok"
                ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400"
                : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive"
            }
          >
            {message.text}
          </p>
        )}

        <p className="text-muted-foreground">
          Files up to {supabaseMaxLabel} are stored in Supabase. Anything
          larger uploads straight from the browser to Google Drive, so big
          files never pass through this server.
        </p>

        {connected ? (
          <>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <CloudIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{email}</p>
                  <p className="text-xs text-muted-foreground">
                    Uploads over {supabaseMaxLabel} go here
                  </p>
                </div>
              </div>
              {folderName && (
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs">{folderName}</span>
                  </span>
                  {folderId && (
                    <a
                      href={`https://drive.google.com/drive/folders/${folderId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open in Drive
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This app uses the <code>drive.file</code> scope — it can only see
              files it created itself, never the rest of the Drive.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<a href="/api/google/connect" />}
              >
                Reconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onDisconnect}
                disabled={pending}
              >
                {pending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          </>
        ) : configured ? (
          <Button size="sm" render={<a href="/api/google/connect" />}>
            Connect Google Drive
          </Button>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,{" "}
            <code>APP_URL</code> and <code>GOOGLE_TOKEN_ENC_KEY</code> in your
            environment, then restart the server to enable this.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
