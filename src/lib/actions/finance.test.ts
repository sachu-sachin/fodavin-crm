import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentMilestone: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  setMilestoneStatus,
} = await import("./finance");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function authorized(userId = "user-1") {
  vi.mocked(authorize).mockResolvedValue({
    userId,
    profile: null,
    isAdmin: false,
    permissions: new Set(),
  } as never);
}

function unauthorized() {
  vi.mocked(authorize).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T06:00:00Z")); // 2026-03-10 IST
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMilestone", () => {
  it("denies when the caller lacks finance.manage", async () => {
    unauthorized();
    const result = await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "1000" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.paymentMilestone.create).not.toHaveBeenCalled();
  });

  it("requires a project", async () => {
    authorized();
    const result = await createMilestone({}, form({ label: "Advance", amount: "1000" }));
    expect(result.error).toMatch(/project/i);
  });

  it("requires a non-empty label", async () => {
    authorized();
    const result = await createMilestone({}, form({ project_id: "p1", label: "  ", amount: "1000" }));
    expect(result.error).toMatch(/label/i);
  });

  it.each(["0", "-5", "abc", ""])("rejects an invalid amount (%s)", async (amount) => {
    authorized();
    const result = await createMilestone({}, form({ project_id: "p1", label: "Advance", amount }));
    expect(result.error).toMatch(/amount/i);
  });

  it("accepts a comma-formatted amount", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue(null);
    await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "1,00,000" }));
    expect(prisma.paymentMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 100000 }) }),
    );
  });

  it("positions the new milestone after the last one", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue({ position: 4 } as never);
    await createMilestone({}, form({ project_id: "p1", label: "Final", amount: "500" }));
    expect(prisma.paymentMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 5 }) }),
    );
  });

  it("starts position at 0 when there are no existing milestones", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue(null);
    await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "500" }));
    expect(prisma.paymentMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
    );
  });

  it("falls back to 'pending' for an unrecognised status", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue(null);
    await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "500", status: "bogus" }));
    expect(prisma.paymentMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending", paid_on: null }) }),
    );
  });

  it("stamps paid_on with today (IST) when created directly as paid", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue(null);
    await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "500", status: "paid" }));
    expect(prisma.paymentMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", paid_on: new Date("2026-03-10T00:00:00Z") }),
      }),
    );
  });

  it("revalidates the project pages and returns a success message on success", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findFirst).mockResolvedValue(null);
    const result = await createMilestone({}, form({ project_id: "p1", label: "Advance", amount: "500" }));
    expect(result.success).toContain("Advance");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p1");
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

describe("updateMilestone", () => {
  it("denies when the caller lacks finance.manage", async () => {
    unauthorized();
    const result = await updateMilestone({}, form({ id: "m1", label: "Advance", amount: "1000" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
  });

  it("errors when the milestone no longer exists", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue(null);
    const result = await updateMilestone({}, form({ id: "gone", label: "Advance", amount: "500" }));
    expect(result.error).toMatch(/no longer exists/i);
  });

  it("keeps the existing paid_on when a milestone that was already paid stays paid", async () => {
    authorized();
    const existingPaidOn = new Date("2026-01-01T00:00:00Z");
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue({
      project_id: "p1",
      paid_on: existingPaidOn,
    } as never);

    await updateMilestone({}, form({ id: "m1", label: "Advance", amount: "500", status: "paid" }));

    expect(prisma.paymentMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid_on: existingPaidOn }) }),
    );
  });

  it("stamps today when a milestone newly becomes paid", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue({
      project_id: "p1",
      paid_on: null,
    } as never);

    await updateMilestone({}, form({ id: "m1", label: "Advance", amount: "500", status: "paid" }));

    expect(prisma.paymentMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid_on: new Date("2026-03-10T00:00:00Z") }) }),
    );
  });

  it("clears paid_on when a milestone moves back to pending", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue({
      project_id: "p1",
      paid_on: new Date("2026-01-01T00:00:00Z"),
    } as never);

    await updateMilestone({}, form({ id: "m1", label: "Advance", amount: "500", status: "pending" }));

    expect(prisma.paymentMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid_on: null }) }),
    );
  });
});

describe("deleteMilestone", () => {
  it("does nothing when unauthorized", async () => {
    unauthorized();
    await deleteMilestone(form({ id: "m1" }));
    expect(prisma.paymentMilestone.delete).not.toHaveBeenCalled();
  });

  it("does nothing when the milestone doesn't exist", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue(null);
    await deleteMilestone(form({ id: "gone" }));
    expect(prisma.paymentMilestone.delete).not.toHaveBeenCalled();
  });

  it("deletes and revalidates when found", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue({ project_id: "p1" } as never);
    await deleteMilestone(form({ id: "m1" }));
    expect(prisma.paymentMilestone.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p1");
  });
});

describe("setMilestoneStatus", () => {
  it("does nothing when unauthorized", async () => {
    unauthorized();
    await setMilestoneStatus("m1", "paid");
    expect(prisma.paymentMilestone.update).not.toHaveBeenCalled();
  });

  it("ignores an invalid status value", async () => {
    authorized();
    // @ts-expect-error deliberately invalid
    await setMilestoneStatus("m1", "cancelled");
    expect(prisma.paymentMilestone.findUnique).not.toHaveBeenCalled();
  });

  it("does nothing when the milestone doesn't exist", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue(null);
    await setMilestoneStatus("gone", "paid");
    expect(prisma.paymentMilestone.update).not.toHaveBeenCalled();
  });

  it("updates status and stamps paid_on for a valid milestone", async () => {
    authorized();
    vi.mocked(prisma.paymentMilestone.findUnique).mockResolvedValue({
      project_id: "p1",
      paid_on: null,
    } as never);
    await setMilestoneStatus("m1", "paid");
    expect(prisma.paymentMilestone.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { status: "paid", paid_on: new Date("2026-03-10T00:00:00Z") },
    });
  });
});
