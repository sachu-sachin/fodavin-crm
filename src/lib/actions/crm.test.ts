import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));

vi.mock("@/lib/document-files", () => ({
  purgeDocumentFiles: vi.fn().mockResolvedValue({ storageRemoved: 0, driveRemoved: 0, failed: 0 }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    contact: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    inquiry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    project: { create: vi.fn(), findFirst: vi.fn() },
    document: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const { revalidatePath } = await import("next/cache");
const { redirect } = await import("next/navigation");
const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { purgeDocumentFiles } = await import("@/lib/document-files");
const { prisma } = await import("@/lib/prisma");
const {
  createCompany, updateCompany, deleteCompany,
  createContact, updateContact, deleteContact,
  createInquiry, updateInquiry, deleteInquiry, moveInquiryStage,
  convertInquiryToProject,
} = await import("./crm");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function authorized(userId = "user-1") {
  vi.mocked(authorize).mockResolvedValue({ userId, profile: null, isAdmin: false, permissions: new Set() } as never);
}

function unauthorized() {
  vi.mocked(authorize).mockResolvedValue(null);
}

beforeEach(() => vi.clearAllMocks());

describe("createCompany", () => {
  it("denies without clients.manage", async () => {
    unauthorized();
    const result = await createCompany({}, form({ name: "Acme" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
  });

  it("requires a name", async () => {
    authorized();
    const result = await createCompany({}, form({ name: "  " }));
    expect(result.error).toMatch(/name/i);
  });

  it("creates the company and revalidates /crm", async () => {
    authorized("u1");
    const result = await createCompany({}, form({ name: "Acme", website: "acme.com" }));
    expect(result.success).toContain("Acme");
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Acme", created_by: "u1" }) }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm");
  });

  it("stores optional fields as null when blank rather than empty strings", async () => {
    authorized();
    await createCompany({}, form({ name: "Acme", website: "" }));
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ website: null }) }),
    );
  });
});

describe("updateCompany", () => {
  it("requires a name", async () => {
    authorized();
    const result = await updateCompany({}, form({ id: "c1", name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("updates the company and revalidates both the list and detail pages", async () => {
    authorized();
    const result = await updateCompany({}, form({ id: "c1", name: "Acme Renamed" }));
    expect(result.success).toBeTruthy();
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ name: "Acme Renamed" }) }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/c1");
  });
});

describe("deleteCompany", () => {
  it("does nothing without clients.delete", async () => {
    unauthorized();
    await deleteCompany(form({ id: "c1" }));
    expect(prisma.company.delete).not.toHaveBeenCalled();
  });

  it("purges the company's documents before deleting, then redirects", async () => {
    authorized();
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      { source: "upload", storage_path: "x", drive_file_id: null },
    ] as never);

    await expect(deleteCompany(form({ id: "c1" }))).rejects.toThrow("REDIRECT:/crm");

    expect(purgeDocumentFiles).toHaveBeenCalledWith([
      { source: "upload", storage_path: "x", drive_file_id: null },
    ]);
    expect(prisma.company.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(redirect).toHaveBeenCalledWith("/crm");
  });
});

describe("createContact / updateContact / deleteContact", () => {
  it("requires a name on create", async () => {
    authorized();
    const result = await createContact({}, form({ company_id: "c1", full_name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("creates a contact tied to a company", async () => {
    authorized("u1");
    const result = await createContact({}, form({ company_id: "c1", full_name: "Jane Doe" }));
    expect(result.success).toContain("Jane Doe");
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ company_id: "c1", full_name: "Jane Doe" }) }),
    );
  });

  it("stores a null company_id for a contact not tied to any company", async () => {
    authorized();
    await createContact({}, form({ company_id: "", full_name: "Jane Doe" }));
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ company_id: null }) }),
    );
  });

  it("requires a name on update", async () => {
    authorized();
    const result = await updateContact({}, form({ id: "ct1", company_id: "c1", full_name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("updates a contact and revalidates its company page", async () => {
    authorized();
    const result = await updateContact({}, form({ id: "ct1", company_id: "c1", full_name: "Jane Smith" }));
    expect(result.success).toBeTruthy();
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ct1" }, data: expect.objectContaining({ full_name: "Jane Smith" }) }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm/c1");
  });

  it("denies delete without clients.manage", async () => {
    unauthorized();
    await deleteContact(form({ id: "ct1", company_id: "c1" }));
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });
});

describe("createInquiry", () => {
  it("requires a title", async () => {
    authorized();
    const result = await createInquiry({}, form({ title: "" }));
    expect(result.error).toMatch(/title/i);
  });

  it("rejects a non-numeric budget", async () => {
    authorized();
    const result = await createInquiry({}, form({ title: "New site", budget: "not-a-number" }));
    expect(result.error).toMatch(/budget/i);
  });

  it("allows an empty budget (null)", async () => {
    authorized();
    await createInquiry({}, form({ title: "New site", budget: "" }));
    expect(prisma.inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ budget: null }) }),
    );
  });

  it("falls back to 'website' for an unrecognised type", async () => {
    authorized();
    await createInquiry({}, form({ title: "New site", type: "spaceship" }));
    expect(prisma.inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "website" }) }),
    );
  });

  it("drops an unrecognised source to null rather than storing it", async () => {
    authorized();
    await createInquiry({}, form({ title: "New site", source: "carrier-pigeon" }));
    expect(prisma.inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: null }) }),
    );
  });
});

describe("updateInquiry — stage-dependent fields", () => {
  it("clears next_follow_up and requires no lost_reason once stage is 'won'", async () => {
    authorized();
    await updateInquiry({}, form({ id: "i1", title: "New site", stage: "won", next_follow_up: "2026-05-01" }));
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ next_follow_up: null, lost_reason: null }) }),
    );
  });

  it("keeps next_follow_up and captures lost_reason when stage is 'lost'", async () => {
    authorized();
    await updateInquiry({}, form({
      id: "i1", title: "New site", stage: "lost", lost_reason: "Went with a competitor",
    }));
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ next_follow_up: null, lost_reason: "Went with a competitor" }),
      }),
    );
  });

  it("keeps next_follow_up and nulls lost_reason for an open stage", async () => {
    authorized();
    await updateInquiry({}, form({
      id: "i1", title: "New site", stage: "contacted", next_follow_up: "2026-05-01",
    }));
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          next_follow_up: new Date("2026-05-01T00:00:00Z"),
          lost_reason: null,
        }),
      }),
    );
  });

  it("falls back to 'new' for an unrecognised stage", async () => {
    authorized();
    await updateInquiry({}, form({ id: "i1", title: "New site", stage: "bogus" }));
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "new" }) }),
    );
  });
});

describe("moveInquiryStage", () => {
  it("ignores an invalid stage without touching the database", async () => {
    authorized();
    // @ts-expect-error deliberately invalid
    await moveInquiryStage("i1", "archived");
    expect(prisma.inquiry.update).not.toHaveBeenCalled();
  });

  it("clears next_follow_up when moving into a closed stage", async () => {
    authorized();
    await moveInquiryStage("i1", "won");
    expect(prisma.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "won", next_follow_up: null }) }),
    );
  });

  it("does not touch next_follow_up when moving between open stages", async () => {
    authorized();
    await moveInquiryStage("i1", "contacted");
    expect(prisma.inquiry.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { stage: "contacted" },
    });
  });
});

describe("convertInquiryToProject", () => {
  it("redirects to the pipeline when the inquiry no longer exists", async () => {
    authorized();
    vi.mocked(prisma.inquiry.findUnique).mockResolvedValue(null);
    await expect(convertInquiryToProject(form({ id: "gone" }))).rejects.toThrow("REDIRECT:/pipeline");
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("is idempotent: re-converting opens the already-created project instead of duplicating it", async () => {
    authorized();
    vi.mocked(prisma.inquiry.findUnique).mockResolvedValue({ id: "i1", type: "website" } as never);
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: "existing-project" } as never);

    await expect(convertInquiryToProject(form({ id: "i1" }))).rejects.toThrow(
      "REDIRECT:/projects/existing-project",
    );
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("creates the project, marks the inquiry won, and redirects to the new project", async () => {
    authorized("u1");
    vi.mocked(prisma.inquiry.findUnique).mockResolvedValue({
      id: "i1", title: "New site", type: "ecommerce", company_id: "c1", notes: "notes", budget: 5000,
    } as never);
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.project.create).mockResolvedValue({ id: "new-project" } as never);

    await expect(convertInquiryToProject(form({ id: "i1" }))).rejects.toThrow(
      "REDIRECT:/projects/new-project",
    );

    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New site", type: "ecommerce", company_id: "c1", inquiry_id: "i1", budget: 5000,
          created_by: "u1",
        }),
      }),
    );
    expect(prisma.inquiry.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { stage: "won", next_follow_up: null },
    });
  });
});

describe("deleteInquiry", () => {
  it("does nothing without pipeline.delete", async () => {
    unauthorized();
    await deleteInquiry(form({ id: "i1" }));
    expect(prisma.inquiry.delete).not.toHaveBeenCalled();
  });
});
