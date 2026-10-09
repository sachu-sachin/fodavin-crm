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
    meeting: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    profile: { findMany: vi.fn() },
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { createMeeting, updateMeeting, saveMeetingNotes, deleteMeeting } =
  await import("./meetings");

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

/** Pretend these profile ids exist and are active. */
function activeProfiles(...ids: string[]) {
  vi.mocked(prisma.profile.findMany).mockResolvedValue(ids.map((id) => ({ id })) as never);
}

const VALID = { title: "Kickoff", starts_at: "2026-03-10T15:30" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.meeting.create).mockResolvedValue({ id: "m1" } as never);
  vi.mocked(prisma.profile.findMany).mockResolvedValue([]);
});

describe("createMeeting", () => {
  it("denies without meetings.manage", async () => {
    unauthorized();
    const result = await createMeeting({}, form(VALID));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(authorize).toHaveBeenCalledWith("meetings.manage");
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("requires a title", async () => {
    authorized();
    const result = await createMeeting({}, form({ ...VALID, title: "  " }));
    expect(result.error).toMatch(/title/i);
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("requires a date and time", async () => {
    authorized();
    const result = await createMeeting({}, form({ ...VALID, starts_at: "" }));
    expect(result.error).toMatch(/date and time/i);
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  it("creates the meeting with IST time, attendees and the creator, and returns its id", async () => {
    authorized("user-1");
    activeProfiles("p1", "p2");

    const result = await createMeeting(
      {},
      form({
        ...VALID,
        type: "client",
        duration_minutes: "45",
        location: " https://meet.example/abc ",
        company_id: "c1",
        project_id: "pr1",
        agenda: "Scope",
        attendee_ids: ["p1", "p2", "p1"],
      }),
    );

    expect(result).toEqual({ success: '"Kickoff" scheduled.', id: "m1" });
    expect(prisma.profile.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1", "p2"] }, is_active: true },
      select: { id: true },
    });
    expect(prisma.meeting.create).toHaveBeenCalledWith({
      data: {
        title: "Kickoff",
        type: "client",
        starts_at: new Date("2026-03-10T10:00:00Z"), // 15:30 IST
        duration_minutes: 45,
        location: "https://meet.example/abc",
        company_id: "c1",
        project_id: "pr1",
        agenda: "Scope",
        created_by: "user-1",
        attendees: { create: [{ profile_id: "p1" }, { profile_id: "p2" }] },
      },
      select: { id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/pr1");
  });

  it("drops attendees who don't exist or have left", async () => {
    authorized();
    activeProfiles("p1");
    await createMeeting({}, form({ ...VALID, attendee_ids: ["p1", "gone"] }));
    expect(vi.mocked(prisma.meeting.create).mock.calls[0][0].data.attendees).toEqual({
      create: [{ profile_id: "p1" }],
    });
  });

  it("skips the profile lookup when nobody is attending", async () => {
    authorized();
    await createMeeting({}, form(VALID));
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.meeting.create).mock.calls[0][0].data.attendees).toEqual({
      create: [],
    });
  });

  it("falls back to safe defaults for an unknown type or duration", async () => {
    authorized();
    await createMeeting({}, form({ ...VALID, type: "party", duration_minutes: "37" }));
    const data = vi.mocked(prisma.meeting.create).mock.calls[0][0].data;
    expect(data.type).toBe("internal");
    expect(data.duration_minutes).toBeNull();
  });

  it("ignores notes and decisions, which are saved separately", async () => {
    authorized();
    await createMeeting({}, form({ ...VALID, notes: "x", decisions: "y" }));
    const data = vi.mocked(prisma.meeting.create).mock.calls[0][0].data;
    expect(data).not.toHaveProperty("notes");
    expect(data).not.toHaveProperty("decisions");
  });
});

describe("updateMeeting", () => {
  it("denies without meetings.manage", async () => {
    unauthorized();
    const result = await updateMeeting({}, form({ ...VALID, id: "m1" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it("validates like create", async () => {
    authorized();
    expect((await updateMeeting({}, form({ id: "m1", title: "", starts_at: VALID.starts_at }))).error).toMatch(/title/i);
    expect((await updateMeeting({}, form({ id: "m1", title: "X", starts_at: "" }))).error).toMatch(/date and time/i);
    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it("errors for a meeting that no longer exists", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(null);
    const result = await updateMeeting({}, form({ ...VALID, id: "m1" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it("replaces the attendee list and refreshes both the old and new client/project pages", async () => {
    authorized();
    activeProfiles("p2");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      company_id: "old-c",
      project_id: null,
    } as never);

    const result = await updateMeeting(
      {},
      form({ ...VALID, id: "m1", company_id: "new-c", attendee_ids: ["p2"] }),
    );

    expect(result).toEqual({ success: "Meeting updated." });
    const call = vi.mocked(prisma.meeting.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1" });
    expect(call.data.attendees).toEqual({
      deleteMany: {},
      create: [{ profile_id: "p2" }],
    });
    expect(call.data).not.toHaveProperty("notes");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/new-c");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/old-c");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
  });
});

describe("saveMeetingNotes", () => {
  it("denies without meetings.manage", async () => {
    unauthorized();
    const result = await saveMeetingNotes({}, form({ id: "m1", notes: "x" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it("errors for a meeting that no longer exists", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(null);
    const result = await saveMeetingNotes({}, form({ id: "m1", notes: "x" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it("saves only notes and decisions, clearing blank ones", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({ id: "m1" } as never);
    const result = await saveMeetingNotes(
      {},
      form({ id: "m1", notes: " Went well ", decisions: "  ", title: "ignored" }),
    );
    expect(result).toEqual({ success: "Notes saved." });
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { notes: "Went well", decisions: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
  });
});

describe("deleteMeeting", () => {
  it("does nothing without meetings.manage", async () => {
    unauthorized();
    await deleteMeeting(form({ id: "m1" }));
    expect(prisma.meeting.delete).not.toHaveBeenCalled();
  });

  it("deletes, refreshes the linked pages and the task board, then redirects", async () => {
    authorized();
    vi.mocked(prisma.meeting.delete).mockResolvedValue({
      company_id: "c1",
      project_id: "pr1",
    } as never);

    await expect(deleteMeeting(form({ id: "m1" }))).rejects.toThrow("REDIRECT:/meetings");
    expect(prisma.meeting.delete).toHaveBeenCalledWith({
      where: { id: "m1" },
      select: { company_id: true, project_id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/crm/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/pr1");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });
});
