"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CloudIcon, HardDriveIcon, UploadIcon, XIcon } from "lucide-react";
import { uploadDocument, linkDocument } from "@/lib/actions/documents";
import { startDriveUpload, finishDriveUpload } from "@/lib/actions/google";
import { DOCUMENT_KINDS } from "@/lib/types";
import { formatSize } from "@/lib/documents";
import { isDriveUrl, parseDriveUrl, driveKindLabel } from "@/lib/drive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

type Mode = "upload" | "link";

/**
 * PUT the file straight to Google's resumable session URI.
 *
 * XHR rather than fetch purely for upload progress — fetch still can't report
 * request-body progress in browsers. The session URI is a capability handed
 * to us by the server; no access token is ever exposed here.
 */
function putToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: { xhr?: XMLHttpRequest },
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string });
        } catch {
          reject(new Error("Drive returned an unreadable response."));
        }
      } else {
        reject(new Error(`Drive rejected the upload (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during the upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export function DocumentAddDialog({
  companyId,
  projectId,
  driveConnected,
  supabaseMaxBytes,
  trigger,
}: {
  companyId?: string;
  projectId?: string;
  driveConnected: boolean;
  supabaseMaxBytes: number;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<{ xhr?: XMLHttpRequest }>({});

  const drive = mode === "link" && url.trim() ? parseDriveUrl(url) : null;
  const needsDrive = !!file && file.size > supabaseMaxBytes;
  const blockedTooBig = needsDrive && !driveConnected;
  const busy = pending || progress !== null;

  function pickFile(next: File | null) {
    setFile(next);
    setError(undefined);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    // Keep the native input in sync so the plain-form (Supabase) path still
    // submits the file the user actually dropped.
    const dt = new DataTransfer();
    dt.items.add(dropped);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    pickFile(dropped);
  }

  async function handleBigFileUpload(formData: FormData) {
    if (!file) return;
    setProgress(0);
    try {
      const session = await startDriveUpload({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        companyId,
        projectId,
      });
      if (session.error || !session.uploadUrl) {
        setError(session.error ?? "Could not start the upload.");
        return;
      }

      const uploaded = await putToDrive(
        session.uploadUrl,
        file,
        setProgress,
        uploadRef.current,
      );

      const res = await finishDriveUpload({
        fileId: uploaded.id,
        name: String(formData.get("name") ?? "").trim() || file.name,
        kind: String(formData.get("kind") ?? "other"),
        companyId,
        projectId,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.success ?? "Uploaded to Drive");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setProgress(null);
    }
  }

  function cancelUpload() {
    uploadRef.current.xhr?.abort();
    setProgress(null);
  }

  function reset() {
    setError(undefined);
    setUrl("");
    setFile(null);
    setOpen(false);
  }

  function onAction(formData: FormData) {
    if (mode === "upload" && needsDrive) {
      startTransition(() => {
        void handleBigFileUpload(formData);
      });
      return;
    }

    startTransition(async () => {
      const res = await (mode === "upload" ? uploadDocument : linkDocument)(
        {},
        formData,
      );
      if (res.error) setError(res.error);
      else {
        toast.success(res.success ?? "Saved");
        reset();
      }
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(undefined);
    setFile(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the dialog close mid-upload and orphan the transfer.
        if (!next && progress !== null) return;
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            Upload a file, or link one that already lives in Google Drive.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["upload", "link"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                mode === m
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "upload" ? "Upload file" : "Link"}
            </button>
          ))}
        </div>

        <form key={mode} action={onAction} className="space-y-4">
          {companyId && (
            <input type="hidden" name="company_id" value={companyId} />
          )}
          {projectId && (
            <input type="hidden" name="project_id" value={projectId} />
          )}

          {mode === "upload" ? (
            <div className="space-y-2">
              {/* Hidden input drives both the click-to-browse and the plain
                  form submission; the styled area is just the drop target. */}
              <input
                ref={fileInputRef}
                id="file"
                name="file"
                type="file"
                required
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />

              {file ? (
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    blockedTooBig ? "border-destructive/50" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatSize(file.size)}
                    </p>
                  </div>
                  {progress === null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove selected file"
                      onClick={() => {
                        if (fileInputRef.current) fileInputRef.current.value = "";
                        pickFile(null);
                      }}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-7 transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <UploadIcon className="size-5 text-muted-foreground" />
                  <span className="mt-2 text-sm font-medium">
                    Drop a file, or click to browse
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {driveConnected
                      ? `Up to ${formatSize(supabaseMaxBytes)} stored here, larger goes to Drive`
                      : `Up to ${formatSize(supabaseMaxBytes)}`}
                  </span>
                </button>
              )}

              {/* Destination is stated explicitly — where a file lands
                  determines who can reach it and what deleting will do. */}
              {file && (
                <div
                  className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-xs ${
                    blockedTooBig
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {needsDrive ? (
                    <CloudIcon className="mt-px size-3.5 shrink-0" />
                  ) : (
                    <HardDriveIcon className="mt-px size-3.5 shrink-0" />
                  )}
                  <span>
                    {blockedTooBig
                      ? `Too large for storage here and Google Drive isn't connected. An admin can connect it under Settings.`
                      : needsDrive
                        ? "Uploads directly to Google Drive — it won't pass through this server."
                        : "Stored privately here. Download links expire after a minute."}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="url">Link</Label>
              <Input
                id="url"
                name="url"
                placeholder="https://docs.google.com/document/d/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              {drive ? (
                <p className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CloudIcon className="mt-px size-3.5 shrink-0" />
                  <span>
                    {driveKindLabel(drive.kind)} recognised. The file stays in
                    Drive and its sharing settings still apply.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {url.trim() && !isDriveUrl(url)
                    ? "Saved as a plain link."
                    : "Any https link works. Google Drive links are recognised automatically."}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder={
                  mode === "upload" ? "Defaults to filename" : "e.g. Proposal v2"
                }
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind"
                name="kind"
                className={selectClass}
                defaultValue="other"
                disabled={busy}
              >
                {DOCUMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {progress !== null && (
            <div className="space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading to Google Drive… {progress}%</span>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="font-medium text-destructive hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy || blockedTooBig}>
              {busy
                ? mode === "upload"
                  ? "Uploading…"
                  : "Saving…"
                : mode === "upload"
                  ? "Upload"
                  : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
