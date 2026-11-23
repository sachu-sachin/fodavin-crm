import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findFirst: vi.fn() },
    inquiry: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));

const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { importLeads } = await import("./lead-import");

const row = (title: string, phone = "") => ({ title, contact_name: "", phone, email: "", notes: "" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorize).mockResolvedValue({ userId: "be-1" } as never);
  vi.mocked(prisma.inquiry.findMany).mockResolvedValue([{ phone: "+91 98765 43210" }] as never);
});

describe("importLeads", () => {
  it("needs pipeline.manage", async () => {
    vi.mocked(authorize).mockResolvedValue(null);
    expect(await importLeads({ rows: [row("A")] })).toEqual({ error: DENIED_MESSAGE });
  });

  it("refuses an empty or oversized list", async () => {
    expect((await importLeads({ rows: [] })).error).toMatch(/no rows/);
    expect((await importLeads({ rows: Array.from({ length: 501 }, (_, i) => row(`L${i}`)) })).error).toMatch(/at most 500/);
  });

  it("creates new leads owned by the importer, skipping phones already in the pipeline or repeated", async () => {
    const r = await importLeads({
      rows: [
        row("Already a lead", "9876543210"),
        row("Kovai Gym", "90000 11111"),
        row("Kovai Gym again", "+91 90000-11111"),
        row("No phone"),
      ],
      source: "cold_outreach",
    });
    expect(r).toEqual({ created: 2, duplicates: ["Already a lead", "Kovai Gym again"] });
    const data = vi.mocked(prisma.inquiry.createMany).mock.calls[0][0]!.data as { title: string; owner_id: string; source: string; stage: string }[];
    expect(data.map((d) => d.title)).toEqual(["Kovai Gym", "No phone"]);
    expect(data.every((d) => d.owner_id === "be-1" && d.source === "cold_outreach" && d.stage === "new")).toBe(true);
  });

  it("assigns another owner only if they're an active employee", async () => {
    vi.mocked(prisma.profile.findFirst).mockResolvedValue(null);
    expect((await importLeads({ rows: [row("A")], ownerId: "gone" })).error).toMatch(/active employee/);
  });
});
