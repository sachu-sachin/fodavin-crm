"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteCall,
  finishRecordingUpload,
  logCall,
  startRecordingUpload,
  uploadCallRecording,
} from "@/lib/actions/calls";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/calls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

/** PUT a file straight to Google's resumable session (no token in the browser). */
function putToDrive(uploadUrl: string, file: File, onProgress: (p: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string });
        } catch {
          reject(new Error("Drive returned an unreadable response."));
        }
      } else reject(new Error(`Drive rejected the upload (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error during the upload."));
    xhr.send(file);
  });
}

/** Upload one recording to a call: the bucket when small, Drive when large. */
async function uploadRecording(
  callId: string,
  file: File,
  maxBucketBytes: number,
  driveConnected: boolean,
  onProgress: (p: number) => void,
): Promise<string | null> {
  if (file.size <= maxBucketBytes) {
    const fd = new FormData();
    fd.set("call_id", callId);
    fd.set("file", file);
    const r = await uploadCallRecording({}, fd);
    return r.error ?? null;
  }
  if (!driveConnected) {
    return "That recording is over 10 MB and Google Drive isn't connected (Settings → Google Drive).";
  }
  const session = await startRecordingUpload({
    callId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  if (session.error || !session.uploadUrl) return session.error ?? "Could not start the upload.";
  const uploaded = await putToDrive(session.uploadUrl, file, onProgress);
  const done = await finishRecordingUpload({ callId, fileId: uploaded.id });
  return done.error ?? null;
}

export function LogCallForm({
  inquiryId,
  nowValue,
  maxBucketBytes,
  driveConnected,
  canUpload,
}: {
  inquiryId: string;
  /** Current IST time as "YYYY-MM-DDTHH:mm". */
  nowValue: string;
  maxBucketBytes: number;
  driveConnected: boolean;
  canUpload: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<number | null>(null);

  function onAction(fd: FormData) {
    const file = fd.get("recording");
    fd.delete("recording");
    start(async () => {
      const r = await logCall({}, fd);
      if (r.error || !r.callId) {
        toast.error(r.error ?? "Could not log the call.");
        return;
      }
      if (file instanceof File && file.size > 0) {
        try {
          setProgress(0);
          const err = await uploadRecording(r.callId, file, maxBucketBytes, driveConnected, setProgress);
          if (err) toast.error(`Call logged, but the recording failed: ${err}`);
          else toast.success("Call logged with its recording.");
        } catch (e) {
          toast.error(`Call logged, but the recording failed: ${e instanceof Error ? e.message : "upload error"}`);
        } finally {
          setProgress(null);
        }
      } else {
        toast.success(r.success ?? "Call logged.");
      }
      ref.current?.reset();
    });
  }

  return (
    <form ref={ref} action={onAction} className="space-y-3">
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="direction">Call</Label>
          <select id="direction" name="direction" className={SELECT} defaultValue="outgoing">
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="outcome">Outcome</Label>
          <select id="outcome" name="outcome" className={SELECT} defaultValue="connected">
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {CALL_OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="called_at">When</Label>
          <Input id="called_at" name="called_at" type="datetime-local" defaultValue={nowValue} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration_minutes">Duration (minutes)</Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={0} max={600} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="next_follow_up">Next follow-up</Label>
          <Input id="next_follow_up" name="next_follow_up" type="date" />
        </div>
        {canUpload && (
          <div className="space-y-1">
            <Label htmlFor="recording">Recording</Label>
            <Input id="recording" name="recording" type="file" accept="audio/*,video/*,.m4a,.amr,.3gp" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="call_notes">Notes</Label>
        <Textarea id="call_notes" name="notes" rows={3} placeholder="What was discussed, what they need, objections…" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (progress != null ? `Uploading ${progress}%…` : "Saving…") : "Log call"}
        </Button>
        {!driveConnected && canUpload && (
          <span className="text-xs text-muted-foreground">Recordings up to 10 MB (connect Google Drive for larger).</span>
        )}
      </div>
    </form>
  );
}

export function AddRecordingButton({
  callId,
  maxBucketBytes,
  driveConnected,
}: {
  callId: string;
  maxBucketBytes: number;
  driveConnected: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept="audio/*,video/*,.m4a,.amr,.3gp"
        aria-label="Recording file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          start(async () => {
            try {
              const err = await uploadRecording(callId, file, maxBucketBytes, driveConnected, () => {});
              if (err) toast.error(err);
              else toast.success("Recording uploaded.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "The upload failed.");
            }
          });
        }}
      />
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "Uploading…" : "Add recording"}
      </Button>
    </>
  );
}

export function DeleteCallButton({ id }: { id: string }) {
  return (
    <form action={deleteCall}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
        Delete
      </Button>
    </form>
  );
}
