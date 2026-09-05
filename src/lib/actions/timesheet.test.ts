import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  can: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
  getSessionProfile: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    timeEntry: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

const { revalidatePath } = await import("next/cache");
const { redirect } = await import("next/navigation");
const { can, getSessionProfile } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { saveTimeEntry, copyPreviousWeek } = await import("./timesheet");

function session(overrides: Partial<{ userId: string }> = {}) {
  return {
    userId: "user-1",
    profile: null,
    isAdmin: false,
    permissions: new Set(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveTimeEntry — auth boundary", () => {
  it("redirects to /login (does not swallow the redirect) when signed out", async () => {
    // Regression test: `redirect()` throws by design (see next/navigation's
    // own docs), so it must never be caught by a generic try/catch. This
    // used to be swallowed by the try/catch around the old resolveTarget().
    vi.mocked(getSessionProfile).mockResolvedValue(null);
    await expect(
      saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 1 }),
    ).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(prisma.timeEntry.upsert).not.toHaveBeenCalled();
  });

  it("denies logging your own time without timesheet.log", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(session());
    vi.mocked(can).mockReturnValue(false);
    const result = await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 1 });
    expect(result.error).toBe("You don't have permission to do that.");
  });

  it("denies editing someone else's sheet without timesheet.manage_all", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(session());
    vi.mocked(can).mockReturnValue(false);
    const result = await saveTimeEntry({
      projectId: "p1", workDate: "2026-01-05", hours: 1, profileId: "other-user",
    });
    expect(result.error).toBe("You can only edit your own timesheet.");
  });

  it("allows editing someone else's sheet with timesheet.manage_all", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(session());
    vi.mocked(can).mockReturnValue(true);
    const result = await saveTimeEntry({
      projectId: "p1", workDate: "2026-01-05", hours: 3, profileId: "other-user",
    });
    expect(result.success).toBeTruthy();
    expect(prisma.timeEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ profile_id: "other-user" }),
      }),
    );
  });
});

describe("saveTimeEntry — validation", () => {
  beforeEach(() => {
    vi.mocked(getSessionProfile).mockResolvedValue(session());
    vi.mocked(can).mockReturnValue(true);
  });

  it("requires a project", async () => {
    const result = await saveTimeEntry({ projectId: "", workDate: "2026-01-05", hours: 1 });
    expect(result.error).toMatch(/project/i);
  });

  it("rejects a malformed date", async () => {
    const result = await saveTimeEntry({ projectId: "p1", workDate: "01/05/2026", hours: 1 });
    expect(result.error).toMatch(/date/i);
  });

  it("rejects negative hours", async () => {
    const result = await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: -1 });
    expect(result.error).toMatch(/positive/i);
  });

  it("rejects non-finite hours", async () => {
    const result = await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: NaN });
    expect(result.error).toMatch(/positive/i);
  });

  it("rejects hours beyond the 24h/day cap", async () => {
    const result = await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 25 });
    expect(result.error).toMatch(/24 hours/);
  });

  it("accepts exactly 24 hours (boundary)", async () => {
    const result = await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 24 });
    expect(result.success).toBeTruthy();
  });

  it("deletes the row instead of writing zero hours", async () => {
    await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 0 });
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { profile_id: "user-1", project_id: "p1", work_date: new Date("2026-01-05T00:00:00Z") },
    });
    expect(prisma.timeEntry.upsert).not.toHaveBeenCalled();
  });

  it("upserts a non-zero entry and revalidates both pages", async () => {
    await saveTimeEntry({ projectId: "p1", workDate: "2026-01-05", hours: 4, note: " on-site " });
    expect(prisma.timeEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ hours: 4, note: "on-site" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/timesheet");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p1");
  });
});

describe("copyPreviousWeek", () => {
  beforeEach(() => {
    vi.mocked(getSessionProfile).mockResolvedValue(session());
    vi.mocked(can).mockReturnValue(true);
  });

  it("redirects to /login when signed out, without swallowing it", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(null);
    await expect(
      copyPreviousWeek({ weekStart: "2026-01-12", previousWeekStart: "2026-01-05" }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("rejects malformed week keys", async () => {
    const result = await copyPreviousWeek({ weekStart: "bad", previousWeekStart: "2026-01-05" });
    expect(result.error).toMatch(/invalid week/i);
  });

  it("errors when last week has nothing to copy", async () => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([]);
    const result = await copyPreviousWeek({ weekStart: "2026-01-12", previousWeekStart: "2026-01-05" });
    expect(result.error).toMatch(/nothing to copy/i);
    expect(prisma.timeEntry.createMany).not.toHaveBeenCalled();
  });

  it("shifts each entry forward by exactly 7 days and skips duplicates", async () => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
      { project_id: "p1", work_date: new Date("2026-01-05T00:00:00Z"), hours: 3, note: null },
    ] as never);

    const result = await copyPreviousWeek({ weekStart: "2026-01-12", previousWeekStart: "2026-01-05" });

    expect(result.success).toBeTruthy();
    expect(prisma.timeEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          project_id: "p1",
          work_date: new Date("2026-01-12T00:00:00Z"),
          hours: 3,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
