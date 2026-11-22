import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  can: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/document-files", () => ({ purgeDocumentFiles: vi.fn() }));
vi.mock("@/lib/google/drive", () => ({
  createResumableSession: vi.fn(),
  getConnectedAccount: vi.fn(),
  getFileMeta: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: { findUnique: vi.fn(), update: vi.fn() },
    callLog: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    document: { create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => [{ id: "call-1" }, ...ops.slice(1)]),
  },
}));

const { authorize, can, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { getConnectedAccount } = await import("@/lib/google/drive");
const { purgeDocumentFiles } = await import("@/lib/document-files");
const { logCall, deleteCall, startRecordingUpload } = await import("./calls");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorize).mockResolvedValue({ userId: "be-1" } as never);
  vi.mocked(can).mockReturnValue(true);
});

describe("logCall", () => {
  it("needs pipeline.manage", async () => {
    vi.mocked(authorize).mockResolvedValue(null);
    expect(await logCall({}, form({ inquiry_id: "l1", outcome: "connected" }))).toEqual({ error: DENIED_MESSAGE });
  });

  it("validates outcome, direction and duration", async () => {
    expect((await logCall({}, form({ inquiry_id: "l1", outcome: "maybe" }))).error).toMatch(/how the call went/);
    expect((await logCall({}, form({ inquiry_id: "l1", outcome: "connected", direction: "sideways" }))).error).toMatch(/incoming or outgoing/);
    expect((await logCall({}, form({ inquiry_id: "l1", outcome: "connected", duration_minutes: "2.5" }))).error).toMatch(/whole minutes/);
  });

  it("logs the call, moves a new lead to contacted and sets its follow-up", async () => {
    vi.mocked(prisma.inquiry.findUnique).mockResolvedValue({ id: "l1", stage: "new", company_id: "c1" } as never);
    const r = await logCall(
      {},
      form({ inquiry_id: "l1", outcome: "connected", duration_minutes: "4", next_follow_up: "2026-11-25", notes: "Wants a quote" }),
    );
    expect(r).toEqual({ success: "Call logged.", callId: "call-1" });
    expect(prisma.callLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inquiry_id: "l1", company_id: "c1", outcome: "connected", duration_minutes: 4, logged_by: "be-1" }),
      }),
    );
    expect(prisma.inquiry.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { stage: "contacted", next_follow_up: new Date("2026-11-25T00:00:00Z") },
    });
  });

  it("not interested closes the lead and clears its follow-up", async () => {
    vi.mocked(prisma.inquiry.findUnique).mockResolvedValue({ id: "l1", stage: "proposal_sent", company_id: null } as never);
    await logCall({}, form({ inquiry_id: "l1", outcome: "not_interested", next_follow_up: "2026-11-25" }));
    expect(prisma.inquiry.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { stage: "not_interested", next_follow_up: null },
    });
  });
});

describe("recordings", () => {
  it("refuses to upload without documents.upload", async () => {
    vi.mocked(can).mockReturnValue(false);
    expect(
      await startRecordingUpload({ callId: "call-1", fileName: "a.m4a", mimeType: "audio/mp4", sizeBytes: 100 }),
    ).toEqual({ error: DENIED_MESSAGE });
  });

  it("needs Drive for a large recording", async () => {
    vi.mocked(prisma.callLog.findUnique).mockResolvedValue({ id: "call-1", inquiry_id: "l1", company_id: null, called_at: new Date() } as never);
    vi.mocked(getConnectedAccount).mockResolvedValue(null as never);
    const r = await startRecordingUpload({ callId: "call-1", fileName: "a.m4a", mimeType: "audio/mp4", sizeBytes: 50_000_000 });
    expect(r.error).toMatch(/Drive isn't connected/);
  });

  it("deleting a call removes its recordings' files too", async () => {
    const recordings = [{ id: "d1", source: "upload", storage_path: "calls/x", drive_file_id: null }];
    vi.mocked(prisma.callLog.findUnique).mockResolvedValue({ inquiry_id: "l1", company_id: null, recordings } as never);
    await deleteCall(form({ id: "call-1" }));
    expect(purgeDocumentFiles).toHaveBeenCalledWith(recordings);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
