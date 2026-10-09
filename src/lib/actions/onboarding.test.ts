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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    onboardingTemplate: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    onboarding: { create: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const {
  saveTemplate,
  deleteTemplate,
  addStarterTemplate,
  startOnboarding,
  deleteOnboarding,
} = await import("./onboarding");
const { STARTER_TEMPLATE } = await import("@/lib/onboarding");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function authorized(userId = "admin") {
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

const ITEMS = JSON.stringify([
  { title: "Laptop", assign_to_new_hire: true, due_offset_days: 0 },
  { title: "Accounts", assignee_id: "it", due_offset_days: -2 },
]);

beforeEach(() => vi.resetAllMocks());

describe("saveTemplate", () => {
  it("denies without onboarding.manage", async () => {
    unauthorized();
    expect(await saveTemplate({}, form({ name: "X", items: ITEMS }))).toEqual({ error: DENIED_MESSAGE });
    expect(authorize).toHaveBeenCalledWith("onboarding.manage");
    expect(prisma.onboardingTemplate.create).not.toHaveBeenCalled();
  });

  it("requires a name and valid steps", async () => {
    authorized();
    expect((await saveTemplate({}, form({ name: " ", items: ITEMS }))).error).toMatch(/name/i);
    expect((await saveTemplate({}, form({ name: "X", items: "[]" }))).error).toMatch(/at least one step/i);
    expect(prisma.onboardingTemplate.create).not.toHaveBeenCalled();
  });

  it("creates a template with ordered steps", async () => {
    authorized("admin");
    const result = await saveTemplate({}, form({ name: "Dev", description: "", items: ITEMS }));
    expect(result).toEqual({ success: '"Dev" created.' });
    expect(prisma.onboardingTemplate.create).toHaveBeenCalledWith({
      data: {
        name: "Dev",
        description: null,
        created_by: "admin",
        items: {
          create: [
            { title: "Laptop", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 0, position: 0 },
            { title: "Accounts", description: null, assign_to_new_hire: false, assignee_id: "it", due_offset_days: -2, position: 1 },
          ],
        },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/templates");
  });

  it("with an id, replaces the template's steps", async () => {
    authorized();
    const result = await saveTemplate({}, form({ id: "t1", name: "Dev", items: ITEMS }));
    expect(result).toEqual({ success: "Template saved." });
    const call = vi.mocked(prisma.onboardingTemplate.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "t1" });
    expect(call.data.items).toMatchObject({ deleteMany: {} });
    expect(prisma.onboardingTemplate.create).not.toHaveBeenCalled();
  });
});

describe("deleteTemplate / addStarterTemplate", () => {
  it("deleteTemplate needs onboarding.manage", async () => {
    unauthorized();
    await deleteTemplate(form({ id: "t1" }));
    expect(prisma.onboardingTemplate.delete).not.toHaveBeenCalled();
    authorized();
    await deleteTemplate(form({ id: "t1" }));
    expect(prisma.onboardingTemplate.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("addStarterTemplate creates the built-in checklist", async () => {
    unauthorized();
    expect(await addStarterTemplate()).toEqual({ error: DENIED_MESSAGE });
    authorized("admin");
    expect((await addStarterTemplate()).success).toMatch(/added/);
    const data = vi.mocked(prisma.onboardingTemplate.create).mock.calls[0][0].data;
    expect(data.name).toBe(STARTER_TEMPLATE.name);
    expect((data.items as { create: unknown[] }).create).toHaveLength(STARTER_TEMPLATE.items.length);
  });
});

describe("startOnboarding", () => {
  const VALID = { profile_id: "hire", template_id: "t1", start_date: "2026-03-02" };
  const template = {
    id: "t1",
    items: [
      { title: "Laptop", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 0 },
      { title: "Accounts", description: null, assign_to_new_hire: false, assignee_id: "it", due_offset_days: -2 },
    ],
  };

  function happyPath() {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ is_active: true, full_name: "Asha", email: null } as never);
    vi.mocked(prisma.onboarding.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.onboardingTemplate.findUnique).mockResolvedValue(template as never);
    vi.mocked(prisma.profile.findMany).mockResolvedValue([{ id: "hire" }, { id: "it" }] as never);
    vi.mocked(prisma.onboarding.create).mockResolvedValue({ id: "o1" } as never);
  }

  it("denies without onboarding.manage", async () => {
    unauthorized();
    expect(await startOnboarding({}, form(VALID))).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.onboarding.create).not.toHaveBeenCalled();
  });

  it("validates the form", async () => {
    authorized();
    expect((await startOnboarding({}, form({ ...VALID, profile_id: "" }))).error).toMatch(/who/i);
    expect((await startOnboarding({}, form({ ...VALID, template_id: "" }))).error).toMatch(/template/i);
    expect((await startOnboarding({}, form({ ...VALID, start_date: "next monday" }))).error).toMatch(/start date/i);
    expect(prisma.onboarding.create).not.toHaveBeenCalled();
  });

  it("refuses an inactive person, a second onboarding, or a missing/empty template", async () => {
    authorized();
    happyPath();
    vi.mocked(prisma.profile.findUnique).mockResolvedValueOnce({ is_active: false } as never);
    expect((await startOnboarding({}, form(VALID))).error).toMatch(/active employee/);

    vi.mocked(prisma.onboarding.findUnique).mockResolvedValueOnce({ id: "old" } as never);
    expect((await startOnboarding({}, form(VALID))).error).toMatch(/already have/);

    vi.mocked(prisma.onboardingTemplate.findUnique).mockResolvedValueOnce(null);
    expect((await startOnboarding({}, form(VALID))).error).toMatch(/no longer exists/);

    vi.mocked(prisma.onboardingTemplate.findUnique).mockResolvedValueOnce({ id: "t1", items: [] } as never);
    expect((await startOnboarding({}, form(VALID))).error).toMatch(/no steps/);

    expect(prisma.onboarding.create).not.toHaveBeenCalled();
  });

  it("creates the onboarding with one dated, assigned task per step and returns its id", async () => {
    authorized("admin");
    happyPath();
    const result = await startOnboarding({}, form(VALID));

    expect(result).toEqual({ success: "Onboarding started — 2 steps for Asha.", id: "o1" });
    const data = vi.mocked(prisma.onboarding.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      profile_id: "hire",
      template_id: "t1",
      start_date: new Date("2026-03-02"),
      created_by: "admin",
    });
    const tasks = (data.tasks as { create: { title: string; assignee_id: string | null; due_date: Date }[] }).create;
    expect(tasks.map((t) => [t.title, t.assignee_id, t.due_date.toISOString().slice(0, 10)])).toEqual([
      ["Laptop", "hire", "2026-03-02"],
      ["Accounts", "it", "2026-02-28"],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });
});

describe("deleteOnboarding", () => {
  it("does nothing without onboarding.manage", async () => {
    unauthorized();
    await deleteOnboarding(form({ id: "o1" }));
    expect(prisma.onboarding.delete).not.toHaveBeenCalled();
  });

  it("deletes (its tasks cascade) and redirects", async () => {
    authorized();
    await expect(deleteOnboarding(form({ id: "o1" }))).rejects.toThrow("REDIRECT:/onboarding");
    expect(prisma.onboarding.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });
});
