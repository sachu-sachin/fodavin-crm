import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  getSessionProfile: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    announcement: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    announcementRead: { upsert: vi.fn() },
    role: { findMany: vi.fn() },
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, getSessionProfile, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAnnouncementRead,
} = await import("./announcements");

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
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

function signedIn(roleId: string | null, userId = "user-1") {
  vi.mocked(getSessionProfile).mockResolvedValue({
    userId,
    profile: { role_id: roleId },
    roleIds: roleId ? [roleId] : [],
    isAdmin: false,
    permissions: new Set(),
  } as never);
}

const NOW = new Date("2026-03-10T06:00:00Z"); // 11:30 IST
const VALID = { title: "Diwali break", body: "Office closed 1–3 Nov." };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(prisma.role.findMany).mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("createAnnouncement", () => {
  it("denies without announcements.manage", async () => {
    unauthorized();
    expect(await createAnnouncement({}, form(VALID))).toEqual({ error: DENIED_MESSAGE });
    expect(authorize).toHaveBeenCalledWith("announcements.manage");
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it("requires a title and a message", async () => {
    authorized();
    expect((await createAnnouncement({}, form({ ...VALID, title: " " }))).error).toMatch(/title/i);
    expect((await createAnnouncement({}, form({ ...VALID, body: "" }))).error).toMatch(/write/i);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it("publishes now when no publish time is given, with safe defaults", async () => {
    authorized("user-1");
    const result = await createAnnouncement({}, form({ ...VALID, category: "nonsense" }));

    expect(result).toEqual({ success: '"Diwali break" posted.' });
    expect(prisma.announcement.create).toHaveBeenCalledWith({
      data: {
        title: "Diwali break",
        body: "Office closed 1–3 Nov.",
        category: "general",
        pinned: false,
        requires_ack: false,
        audience_role_ids: [],
        publish_at: NOW,
        expires_at: null,
        created_by: "user-1",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/announcements");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("schedules one with a future IST publish time, and reads the checkboxes", async () => {
    authorized();
    const result = await createAnnouncement(
      {},
      form({
        ...VALID,
        category: "policy",
        pinned: "on",
        requires_ack: "on",
        publish_at: "2026-03-11T09:00",
        expires_at: "2026-03-20T18:00",
      }),
    );

    expect(result.success).toMatch(/scheduled/);
    const data = vi.mocked(prisma.announcement.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      category: "policy",
      pinned: true,
      requires_ack: true,
      publish_at: new Date("2026-03-11T03:30:00Z"),
      expires_at: new Date("2026-03-20T12:30:00Z"),
    });
  });

  it("rejects an expiry at or before the publish time", async () => {
    authorized();
    const result = await createAnnouncement(
      {},
      form({ ...VALID, publish_at: "2026-03-11T09:00", expires_at: "2026-03-11T09:00" }),
    );
    expect(result.error).toMatch(/expiry must be after/i);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it("rejects an unparseable date", async () => {
    authorized();
    const result = await createAnnouncement({}, form({ ...VALID, expires_at: "soon" }));
    expect(result.error).toMatch(/expiry time isn't valid/i);
  });

  it("keeps only audience roles that exist, de-duplicated", async () => {
    authorized();
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: "r1" }] as never);
    await createAnnouncement({}, form({ ...VALID, audience_role_ids: ["r1", "gone", "r1"] }));

    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1", "gone"] } },
      select: { id: true },
    });
    expect(vi.mocked(prisma.announcement.create).mock.calls[0][0].data.audience_role_ids).toEqual(["r1"]);
  });

  it("refuses when every ticked role is gone, instead of posting it to everyone", async () => {
    authorized();
    vi.mocked(prisma.role.findMany).mockResolvedValue([] as never);
    const result = await createAnnouncement({}, form({ ...VALID, audience_role_ids: ["gone"] }));
    expect(result.error).toMatch(/no longer exist/i);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });
});

describe("updateAnnouncement", () => {
  it("denies without announcements.manage", async () => {
    unauthorized();
    expect(await updateAnnouncement({}, form({ ...VALID, id: "a1" }))).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.announcement.update).not.toHaveBeenCalled();
  });

  function existing(fields: { requires_ack?: boolean; audience_role_ids?: string[] } = {}) {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue({
      requires_ack: false,
      audience_role_ids: [],
      ...fields,
    } as never);
  }

  it("updates without touching who has read it", async () => {
    authorized();
    existing();
    const result = await updateAnnouncement({}, form({ ...VALID, id: "a1" }));
    expect(result).toEqual({ success: "Announcement updated." });
    const call = vi.mocked(prisma.announcement.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "a1" });
    expect(call.data).not.toHaveProperty("reads");
  });

  it("clears every read when asked to, so everyone reads it again", async () => {
    authorized();
    existing();
    const result = await updateAnnouncement({}, form({ ...VALID, id: "a1", reset_reads: "on" }));
    expect(result.success).toMatch(/read it again/);
    expect(vi.mocked(prisma.announcement.update).mock.calls[0][0].data).toMatchObject({
      reads: { deleteMany: {} },
    });
  });

  it("clears reads when acknowledgement is newly required: a plain read isn't an ack", async () => {
    authorized();
    existing({ requires_ack: false });
    const result = await updateAnnouncement({}, form({ ...VALID, id: "a1", requires_ack: "on" }));
    expect(result.success).toMatch(/read it again/);
    expect(vi.mocked(prisma.announcement.update).mock.calls[0][0].data).toMatchObject({
      reads: { deleteMany: {} },
      requires_ack: true,
    });
  });

  it("keeps an already-required acknowledgement's reads", async () => {
    authorized();
    existing({ requires_ack: true });
    await updateAnnouncement({}, form({ ...VALID, id: "a1", requires_ack: "on" }));
    expect(vi.mocked(prisma.announcement.update).mock.calls[0][0].data).not.toHaveProperty("reads");
  });

  it("keeps a deleted role it was already limited to, so an edit never widens the audience", async () => {
    authorized();
    existing({ audience_role_ids: ["deleted-role"] });
    vi.mocked(prisma.role.findMany).mockResolvedValue([] as never);
    const result = await updateAnnouncement(
      {},
      form({ ...VALID, id: "a1", audience_role_ids: ["deleted-role"] }),
    );
    expect(result.error).toBeUndefined();
    expect(vi.mocked(prisma.announcement.update).mock.calls[0][0].data.audience_role_ids).toEqual([
      "deleted-role",
    ]);
  });

  it("errors for an announcement that no longer exists", async () => {
    authorized();
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(null);
    const result = await updateAnnouncement({}, form({ ...VALID, id: "gone" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.announcement.update).not.toHaveBeenCalled();
  });
});

describe("deleteAnnouncement", () => {
  it("does nothing without announcements.manage", async () => {
    unauthorized();
    await deleteAnnouncement(form({ id: "a1" }));
    expect(prisma.announcement.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes and refreshes (a no-op if it's already gone)", async () => {
    authorized();
    await deleteAnnouncement(form({ id: "a1" }));
    expect(prisma.announcement.deleteMany).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/announcements");
  });
});

describe("markAnnouncementRead", () => {
  const live = {
    publish_at: new Date("2026-03-01T00:00:00Z"),
    expires_at: null,
    audience_role_ids: [] as string[],
  };

  it("sends a signed-out caller to login", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(null);
    await expect(markAnnouncementRead("a1")).rejects.toThrow("REDIRECT:/login");
    expect(prisma.announcementRead.upsert).not.toHaveBeenCalled();
  });

  it("records the read for a live announcement addressed to everyone", async () => {
    signedIn("r1", "user-7");
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(live as never);
    expect((await markAnnouncementRead("a1")).success).toBeDefined();
    expect(prisma.announcementRead.upsert).toHaveBeenCalledWith({
      where: { announcement_id_profile_id: { announcement_id: "a1", profile_id: "user-7" } },
      create: { announcement_id: "a1", profile_id: "user-7" },
      update: {},
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses one that doesn't exist, isn't live yet, has expired, or isn't for the caller's role, all with the same message", async () => {
    signedIn("r1");
    const cases = [
      null,
      { ...live, publish_at: new Date("2026-03-11T00:00:00Z") },
      { ...live, expires_at: new Date("2026-03-09T00:00:00Z") },
      { ...live, audience_role_ids: ["r2"] },
    ];
    const errors = new Set<string | undefined>();
    for (const found of cases) {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValueOnce(found as never);
      errors.add((await markAnnouncementRead("a1")).error);
    }
    expect(prisma.announcementRead.upsert).not.toHaveBeenCalled();
    // One identical refusal, so it can't be used to tell hidden ones apart.
    expect(errors.size).toBe(1);
    expect([...errors][0]).toMatch(/no longer available/i);
  });
});
