import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((p: string) => {
    throw new Error(`REDIRECT:${p}`);
  }),
}));
vi.mock("@/lib/auth", () => ({
  getSessionProfile: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));
vi.mock("@/lib/reports-data", () => ({ canReviewReportsOf: vi.fn() }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  istToday: vi.fn(() => "2026-11-23"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: vi.fn(), update: vi.fn() },
    dailyReport: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { getSessionProfile, DENIED_MESSAGE } = await import("@/lib/auth");
const { canReviewReportsOf } = await import("@/lib/reports-data");
const { prisma } = await import("@/lib/prisma");
const { submitMorningReport, submitEodReport, reviewReport } = await import("./reports");

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionProfile).mockResolvedValue({ userId: "me", permissions: new Set() } as never);
});

describe("submitMorningReport", () => {
  it("needs a plan or tasks", async () => {
    expect((await submitMorningReport({}, form({ plan: " " }))).error).toMatch(/plan/);
  });

  it("keeps only the caller's own tasks and upserts today's plan", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: "t1" }] as never);
    const r = await submitMorningReport({}, form({ plan: "SEO audit", task_ids: ["t1", "someone-elses"] }));
    expect(r.success).toBeTruthy();
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "someone-elses"] }, assignee_id: "me" },
      select: { id: true },
    });
    const call = vi.mocked(prisma.dailyReport.upsert).mock.calls[0][0];
    expect(call.where).toEqual({
      profile_id_report_date_kind: {
        profile_id: "me",
        report_date: new Date("2026-11-23T00:00:00Z"),
        kind: "morning",
      },
    });
    expect(call.update).toEqual({ plan: "SEO audit", task_ids: ["t1"] });
  });
});

describe("submitEodReport", () => {
  it("needs something to report", async () => {
    expect((await submitEodReport({}, form({ blockers: "none" }))).error).toMatch(/completed/);
  });

  it("moves only the caller's open ticked tasks to Done, with a finish time", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      { id: "t1", status: "in_progress", started_at: new Date(), completed_at: null, actual_hours: null },
    ] as never);
    const r = await submitEodReport({}, form({ completed: "Blog drafts", done_task_ids: ["t1", "t9"] }));
    expect(r.success).toBeTruthy();
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["t1", "t9"] }, assignee_id: "me", status: { not: "done" } },
      }),
    );
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    const upd = vi.mocked(prisma.task.update).mock.calls[0][0] as { where: { id: string }; data: { status: string; completed_at: Date } };
    expect(upd.where.id).toBe("t1");
    expect(upd.data.status).toBe("done");
    expect(upd.data.completed_at).toBeInstanceOf(Date);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("reviewReport", () => {
  it("refuses someone outside the person's team", async () => {
    vi.mocked(prisma.dailyReport.findUnique).mockResolvedValue({ profile_id: "p1" } as never);
    vi.mocked(canReviewReportsOf).mockResolvedValue(false);
    expect(await reviewReport({}, form({ id: "r1", review_note: "Good" }))).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.dailyReport.update).not.toHaveBeenCalled();
  });

  it("saves the lead's comment", async () => {
    vi.mocked(prisma.dailyReport.findUnique).mockResolvedValue({ profile_id: "p1" } as never);
    vi.mocked(canReviewReportsOf).mockResolvedValue(true);
    expect((await reviewReport({}, form({ id: "r1", review_note: "Good" }))).success).toBeTruthy();
    expect(prisma.dailyReport.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ review_note: "Good", reviewed_by: "me" }),
    });
  });
});
